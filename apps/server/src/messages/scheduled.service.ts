import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ChatType } from '@prisma/client';
import { ChatMemberRole, MessageType } from '@FLUX/shared';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { MessagesService } from './messages.service';
import { validateEntities } from './entities.util';
import { ScheduleMessageDto } from './dto/messages.dto';

export const MAX_SCHEDULED_PER_CHAT = 100;
const MAX_AHEAD_MS = 365 * 24 * 3600_000;
const TICK_MS = 15_000;

/**
 * Messages sent at a chosen time. Stored apart from `Message`, so nothing shows
 * before it is due. A timer in this process sends the due ones; a message is
 * claimed by deleting its row first, so it can never be sent twice.
 */
@Injectable()
export class ScheduledMessagesService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ScheduledMessagesService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly messages: MessagesService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.sendDue(), TICK_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async schedule(userId: string, chatId: string, dto: ScheduleMessageDto) {
    const member = await this.prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId, userId } },
      include: { chat: { select: { type: true, e2ee: true } } },
    });
    if (!member) throw new ForbiddenException('Not a member of this chat');
    if (member.chat.type === ChatType.SECRET || member.chat.e2ee) {
      throw new BadRequestException({
        message: 'Messages cannot be scheduled in a secret chat.',
        code: 'SECRET_SCHEDULE_FORBIDDEN',
      });
    }

    // The post is sent later under the same rules as a live one: refuse now what would fail then.
    if (member.role === ChatMemberRole.RESTRICTED) {
      throw new ForbiddenException({ message: 'You are not allowed to send messages here.', code: 'MEMBER_RESTRICTED' });
    }
    if (
      member.chat.type === ChatType.CHANNEL &&
      member.role !== ChatMemberRole.OWNER &&
      member.role !== ChatMemberRole.ADMIN
    ) {
      throw new ForbiddenException({ message: 'Only admins can post in a channel.', code: 'CHANNEL_READ_ONLY' });
    }

    const sendAt = new Date(dto.sendAt);
    const now = Date.now();
    if (sendAt.getTime() < now + 10_000 || sendAt.getTime() > now + MAX_AHEAD_MS) {
      throw new BadRequestException({
        message: 'Choose a time between 10 seconds and one year from now.',
        code: 'SCHEDULE_TIME_INVALID',
      });
    }
    if (!dto.content.trim()) throw new BadRequestException('Message is empty');

    const count = await this.prisma.scheduledMessage.count({ where: { chatId, userId } });
    if (count >= MAX_SCHEDULED_PER_CHAT) {
      throw new BadRequestException({
        message: `At most ${MAX_SCHEDULED_PER_CHAT} scheduled messages per chat.`,
        code: 'SCHEDULE_LIMIT_REACHED',
      });
    }

    const entities = dto.entities ? (validateEntities(dto.content, dto.entities) as any) : undefined;
    return this.prisma.scheduledMessage.create({
      data: {
        chatId,
        userId,
        content: dto.content,
        entities,
        replyToMessageId: dto.replyToMessageId,
        sendAt,
      },
    });
  }

  async list(userId: string, chatId: string) {
    const items = await this.prisma.scheduledMessage.findMany({
      where: { chatId, userId },
      orderBy: { sendAt: 'asc' },
    });
    return { items };
  }

  async cancel(userId: string, chatId: string, id: string) {
    const removed = await this.prisma.scheduledMessage.deleteMany({ where: { id, chatId, userId } });
    if (removed.count === 0) throw new NotFoundException('Scheduled message not found');
    return { cancelled: true };
  }

  /** Sends everything that is due. Exposed for tests. */
  async sendDue(): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    let sent = 0;
    try {
      const due = await this.prisma.scheduledMessage.findMany({
        where: { sendAt: { lte: new Date() } },
        orderBy: { sendAt: 'asc' },
        take: 100,
      });
      for (const item of due) {
        const claimed = await this.prisma.scheduledMessage.deleteMany({ where: { id: item.id } });
        if (claimed.count === 0) continue;
        try {
          await this.messages.sendMessage(item.userId, item.chatId, {
            type: MessageType.TEXT,
            content: item.content,
            entities: (item.entities as any) ?? undefined,
            replyToMessageId: item.replyToMessageId ?? undefined,
            clientTempId: randomUUID(),
          });
          sent += 1;
        } catch (error) {
          // The user left the chat or was restricted meanwhile: drop it, do not retry forever.
          this.logger.warn(`Scheduled message ${item.id} was not sent: ${error}`);
        }
      }
    } finally {
      this.running = false;
    }
    return sent;
  }
}
