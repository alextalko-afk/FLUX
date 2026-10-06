import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as webpush from 'web-push';
import { PrismaService } from '../prisma/prisma.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { EXPO_TOKEN_RE, MobilePushService } from './mobile-push.service';
import { PUSH_JOB_OPTIONS, PUSH_QUEUE, PushJob } from './push.queue';
import {
  RegisterDeviceDto,
  SubscribePushDto,
  UpdateNotificationSettingsDto,
} from './dto/notifications.dto';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly vapidPublicKey: string;
  /** True only when a full, usable VAPID key set is configured. */
  private readonly pushEnabled: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly mobilePush: MobilePushService,
    @InjectQueue(PUSH_QUEUE) private readonly pushQueue: Queue,
  ) {
    this.vapidPublicKey = this.configService.get<string>('vapid.publicKey', '');
    const privateKey = this.configService.get<string>('vapid.privateKey', '');
    const subject = this.configService.get<string>('vapid.subject', '');

    this.pushEnabled = Boolean(this.vapidPublicKey && privateKey && subject);

    if (this.pushEnabled) {
      webpush.setVapidDetails(subject, this.vapidPublicKey, privateKey);
    } else {
      this.logger.warn(
        'Web Push is disabled: set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT to enable delivery.',
      );
    }
  }

  getVapidPublicKey(): string {
    return this.vapidPublicKey;
  }

  async subscribe(userId: string, dto: SubscribePushDto) {
    const existing = await this.prisma.pushSubscription.findUnique({
      where: { endpoint: dto.endpoint },
    });

    if (existing) {
      // A browser endpoint can be re-registered after logout; it must belong to
      // exactly one account, so a different owner takes it over rather than
      // leaving two users sharing a device's notifications.
      if (existing.userId === userId) {
        await this.prisma.pushSubscription.update({
          where: { id: existing.id },
          data: {
            keys: { p256dh: dto.p256dh, auth: dto.auth },
          },
        });
        return { subscribed: true };
      }
      await this.prisma.pushSubscription.delete({ where: { id: existing.id } });
    }

    await this.prisma.pushSubscription.create({
      data: {
        userId,
        endpoint: dto.endpoint,
        keys: { p256dh: dto.p256dh, auth: dto.auth },
      },
    });

    return { subscribed: true };
  }

  async unsubscribe(userId: string, endpoint: string) {
    await this.prisma.pushSubscription.deleteMany({
      where: { userId, endpoint },
    });
    return { unsubscribed: true };
  }

  async listDevices(userId: string) {
    const items = await this.prisma.deviceToken.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      select: { id: true, provider: true, platform: true, createdAt: true },
    });
    return { items };
  }

  /** A phone token belongs to one account: registering it again moves it to the latest user. */
  async registerDevice(userId: string, dto: RegisterDeviceDto) {
    if (dto.provider === 'expo' && !EXPO_TOKEN_RE.test(dto.token)) {
      throw new BadRequestException({ message: 'Not an Expo push token.', code: 'DEVICE_TOKEN_INVALID' });
    }
    await this.prisma.deviceToken.upsert({
      where: { token: dto.token },
      create: { userId, provider: dto.provider, platform: dto.platform, token: dto.token },
      update: { userId, provider: dto.provider, platform: dto.platform },
    });
    return { registered: true };
  }

  async unregisterDevice(userId: string, token: string) {
    await this.prisma.deviceToken.deleteMany({ where: { userId, token } });
    return { unregistered: true };
  }

  async getSettings(userId: string) {
    const [settings, subscriptionsCount] = await Promise.all([
      this.prisma.notificationSettings.upsert({
        where: { userId },
        create: { userId },
        update: {},
      }),
      this.prisma.pushSubscription.count({ where: { userId } }),
    ]);

    return { ...settings, subscriptionsCount };
  }

  async updateSettings(userId: string, dto: UpdateNotificationSettingsDto) {
    return this.prisma.notificationSettings.upsert({
      where: { userId },
      create: { userId, ...dto },
      update: { ...dto },
    });
  }

  /**
   * Queues a push for every browser and phone the user registered, one job per target.
   *
   * Delivery happens in the `push` queue worker, so a slow push provider never holds up the
   * message that triggered it, and a failed target is retried with backoff on its own instead of
   * resending to the ones that already got it. Returns how many deliveries were queued.
   */
  async sendPushToUser(
    userId: string,
    title: string,
    body: string,
    data: Record<string, unknown> = {},
  ): Promise<{ sent: number }> {
    const [subscriptions, devices] = await Promise.all([
      this.pushEnabled ? this.prisma.pushSubscription.findMany({ where: { userId }, select: { id: true } }) : [],
      this.prisma.deviceToken.findMany({ where: { userId }, select: { id: true } }),
    ]);

    const payload = JSON.stringify({ title, body, data, timestamp: Date.now() });
    const jobs: { name: string; data: PushJob; opts: typeof PUSH_JOB_OPTIONS }[] = [
      ...subscriptions.map((s) => ({ name: 'web', data: { kind: 'web' as const, targetId: s.id, payload }, opts: PUSH_JOB_OPTIONS })),
      ...devices.map((d) => ({ name: 'mobile', data: { kind: 'mobile' as const, targetId: d.id, payload }, opts: PUSH_JOB_OPTIONS })),
    ];
    if (jobs.length === 0) {
      this.logger.debug(`No push targets for user ${userId}`);
      return { sent: 0 };
    }
    await this.pushQueue.addBulk(jobs);
    return { sent: jobs.length };
  }

  /**
   * Delivers one queued push. Resolves when the target accepted it or is gone for good;
   * throws on a transient failure so the queue retries.
   */
  async deliver(job: PushJob): Promise<void> {
    const message = JSON.parse(job.payload) as { title: string; body: string; data: Record<string, unknown> };

    if (job.kind === 'web') {
      const sub = await this.prisma.pushSubscription.findUnique({ where: { id: job.targetId } });
      if (!sub || !this.pushEnabled) return;
      const keys = sub.keys as { p256dh?: string; auth?: string } | null;
      if (!keys?.p256dh || !keys?.auth) {
        await this.prisma.pushSubscription.deleteMany({ where: { id: sub.id } });
        return;
      }
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } }, job.payload);
      } catch (err: any) {
        // 404/410 mean the subscription is permanently gone; drop it so every
        // future notification does not keep retrying a dead endpoint.
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          await this.prisma.pushSubscription.deleteMany({ where: { id: sub.id } });
          return;
        }
        throw new Error(`Web push to ${sub.endpoint} failed: ${err?.statusCode ?? err}`);
      }
      return;
    }

    const device = await this.prisma.deviceToken.findUnique({ where: { id: job.targetId } });
    if (!device) return;
    const result = await this.mobilePush.send([device], message);
    if (result.invalidIds.length > 0) {
      await this.prisma.deviceToken.deleteMany({ where: { id: { in: result.invalidIds } } });
      return;
    }
    if (result.sent === 0) throw new Error(`Mobile push (${device.provider}) was not accepted`);
  }

  /**
   * Pushes a new-message notification to the given recipients, honouring each
   * user's stored preferences. Users without a settings row fall back to the
   * schema defaults (everything on).
   */
  async notifyNewMessage(params: {
    chatId: string;
    chatType: string;
    senderName: string;
    content: string;
    recipientIds: string[];
  }): Promise<{ sent: number }> {
    const { chatId, chatType, senderName, content, recipientIds } = params;
    if (recipientIds.length === 0) {
      return { sent: 0 };
    }

    const settingsList = await this.prisma.notificationSettings.findMany({
      where: { userId: { in: recipientIds } },
    });
    const settingsByUser = new Map(settingsList.map((s) => [s.userId, s]));

    let sent = 0;
    for (const userId of recipientIds) {
      const settings = settingsByUser.get(userId);

      if (settings) {
        if (!settings.enabled) continue;
        if (chatType === 'PRIVATE' && !settings.privateChats) continue;
        if (chatType === 'GROUP' && !settings.groupChats) continue;
        if (chatType === 'CHANNEL' && !settings.channels) continue;
      }

      const body =
        settings && !settings.showPreview ? 'New message' : content || 'New message';

      const result = await this.sendPushToUser(userId, senderName, body, {
        chatId,
        type: 'message',
      });
      sent += result.sent;
    }

    return { sent };
  }
}
