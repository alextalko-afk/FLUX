import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';

export const BOT_WEBHOOK_QUEUE = 'bot-webhooks';

export type BotUpdateEvent =
  | 'message.new'
  | 'message.updated'
  | 'message.deleted'
  | 'callback_query';

/** Payload delivered to a bot's webhook URL. */
export interface BotUpdate {
  event: BotUpdateEvent;
  timestamp: number;
  chatId: string;
  message?: unknown;
  messageId?: string;
  /** `callback_query`: the button's callbackData and who pressed it. */
  data?: string;
  fromUserId?: string;
}

export interface BotWebhookJobData {
  webhookId: string;
  event: BotUpdateEvent;
  body: string;
}

/**
 * Fans chat activity out to bot webhooks.
 *
 * Delivery is queued (BullMQ) rather than done inline so a slow or dead bot
 * endpoint can never add latency to the message that triggered it, and so
 * transient failures are retried with exponential backoff by the worker.
 */
@Injectable()
export class BotWebhookService {
  private readonly logger = new Logger(BotWebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(BOT_WEBHOOK_QUEUE) private readonly queue: Queue,
  ) {}

  /**
   * Queues `update` for every active webhook of the active bots owned by the
   * other members of `chatId`. `excludeUserId` (the actor) is skipped so a bot
   * never receives an update for the message that its own owner just sent.
   *
   * Returns the number of webhooks queued (0 when the chat has no bots).
   */
  /** Queues `update` for the webhooks of the active bots that belong to exactly `ownerId`. */
  async dispatchToOwner(ownerId: string, update: BotUpdate): Promise<number> {
    const bots = await this.prisma.bot.findMany({
      where: { ownerId, isActive: true },
      select: { webhooks: { where: { isActive: true }, select: { id: true } } },
    });
    const webhookIds = bots.flatMap((bot) => bot.webhooks.map((w) => w.id));
    if (webhookIds.length === 0) return 0;
    const body = JSON.stringify(update);
    await this.queue.addBulk(
      webhookIds.map((webhookId) => ({
        name: 'deliver',
        data: { webhookId, event: update.event, body } satisfies BotWebhookJobData,
        opts: { attempts: 3, backoff: { type: 'exponential', delay: 2000 }, removeOnComplete: 200, removeOnFail: 500 },
      })),
    );
    return webhookIds.length;
  }

  async dispatchToChat(
    chatId: string,
    excludeUserId: string,
    update: BotUpdate,
  ): Promise<number> {
    const members = await this.prisma.chatMember.findMany({
      where: { chatId, userId: { not: excludeUserId } },
      select: { userId: true },
    });

    const ownerIds = members.map((m) => m.userId);
    if (ownerIds.length === 0) return 0;

    const bots = await this.prisma.bot.findMany({
      where: { ownerId: { in: ownerIds }, isActive: true },
      select: { webhooks: { where: { isActive: true }, select: { id: true } } },
    });

    const webhookIds = bots.flatMap((bot) => bot.webhooks.map((w) => w.id));
    if (webhookIds.length === 0) return 0;

    const body = JSON.stringify(update);
    await this.queue.addBulk(
      webhookIds.map((webhookId) => ({
        name: 'deliver',
        data: { webhookId, event: update.event, body } satisfies BotWebhookJobData,
        opts: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
          removeOnComplete: 200,
          removeOnFail: 500,
        },
      })),
    );

    return webhookIds.length;
  }
}
