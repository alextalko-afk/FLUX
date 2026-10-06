import { validateEntities } from './entities.util';
import { PinsService } from './pins.service';
import { PollsService } from './polls.service';
import { StickersService } from './stickers.service';
import { CommentsService } from './comments.service';
import { MetricsService } from '../metrics/metrics.service';
import { LocationsService } from './locations.service';
import { applyReadStatus } from './read-status';
import { assertSecretPayload } from './secret.util';
import { PUBLIC_USER_SELECT, projectMessage } from '../privacy/public-user';
import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { NotificationsService } from '../notifications/notifications.service';
import { PrivacyService } from '../privacy/privacy.service';
import { BotUpdate, BotWebhookService } from '../bots/bot-webhooks.service';
import {
  SendMessageDto,
  EditMessageDto,
  ForwardMessageDto,
  MarkReadDto,
  MessageHistoryQueryDto,
  ReactDto,
} from './dto/messages.dto';
import { ChatMemberRole, ChatType, MessageStatus, RealtimeEvent } from '@FLUX/shared';

@Injectable()
export class MessagesService {
  private readonly logger = new Logger(MessagesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
    private readonly notifications: NotificationsService,
    private readonly privacy: PrivacyService,
    private readonly botWebhooks: BotWebhookService,
    private readonly pins: PinsService,
    private readonly polls: PollsService,
    private readonly stickers: StickersService,
    private readonly comments: CommentsService,
    private readonly metrics: MetricsService,
    private readonly locations: LocationsService,
  ) {}

  /**
   * Fire-and-forget fan-out of chat activity to bot webhooks (queued).
   */
  private dispatchBotUpdate(
    actorId: string,
    chatId: string,
    update: BotUpdate,
  ): void {
    void this.botWebhooks
      .dispatchToChat(chatId, actorId, update)
      .catch((err) => this.logger.warn(`Bot webhook dispatch failed: ${err}`));
  }

  private async checkMembership(userId: string, chatId: string): Promise<void> {
    const member = await this.prisma.chatMember.findFirst({
      where: { chatId, userId },
    });
    if (!member) {
      throw new ForbiddenException('Not a member of this chat');
    }
  }

  /**
   * Loads the uploaded `FileObject` and builds the nested `MessageMedia`
   * create payload. An unknown `mediaId` is rejected instead of silently
   * stored, so a message can never reference a missing attachment.
   *
   * `duration`/`waveform` are only meaningful for voice notes; when absent
   * the columns stay `NULL` rather than storing zeros.
   */
  private async buildMediaRelation(
    fileObjectId: string,
    duration?: number,
    waveform?: number[],
  ) {
    const fileObject = await this.prisma.fileObject.findUnique({
      where: { id: fileObjectId },
    });
    if (!fileObject) {
      throw new NotFoundException('Media file not found');
    }

    return {
      create: {
        fileObjectId: fileObject.id,
        url: `/api/v1/media/download/${fileObject.id}`,
        thumbnailUrl: fileObject.thumbnailKey
          ? `/api/v1/media/download/${fileObject.id}?thumb=1`
          : null,
        mimeType: fileObject.mimeType,
        size: fileObject.size,
        fileName: fileObject.key.split('/').pop() || null,
        // What FFmpeg measured wins over what the client claims.
        duration: fileObject.durationSec ?? duration ?? null,
        width: fileObject.width,
        height: fileObject.height,
        waveform: waveform && waveform.length > 0 ? (waveform as any) : undefined,
      },
    };
  }

  /**
   * Who may post: restricted members never, ordinary members not in a channel,
   * and ordinary members in a group only as often as its slow mode allows.
   * Owners and admins are exempt.
   */
  async assertCanPost(userId: string, chatId: string): Promise<void> {
    const member = await this.prisma.chatMember.findFirst({
      where: { chatId, userId },
      include: { chat: { select: { type: true, slowModeSeconds: true } } },
    });
    if (!member) throw new ForbiddenException('Not a member of this chat');
    if (member.role === ChatMemberRole.OWNER || member.role === ChatMemberRole.ADMIN) return;

    if (member.role === ChatMemberRole.RESTRICTED) {
      throw new ForbiddenException({ message: 'You are not allowed to send messages here.', code: 'MEMBER_RESTRICTED' });
    }
    if (member.chat.type === ChatType.CHANNEL) {
      throw new ForbiddenException({ message: 'Only admins can post in a channel.', code: 'CHANNEL_READ_ONLY' });
    }
    const slow = member.chat.slowModeSeconds;
    if (member.chat.type === ChatType.GROUP && slow > 0) {
      const last = await this.prisma.message.findFirst({
        where: { chatId, senderId: userId },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      });
      const wait = last ? Math.ceil((last.createdAt.getTime() + slow * 1000 - Date.now()) / 1000) : 0;
      if (wait > 0) {
        throw new HttpException(
          { message: `Slow mode: wait ${wait}s.`, code: 'SLOW_MODE', retryAfterSeconds: wait },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }
  }

  /** A topic must belong to this forum chat; a closed topic accepts messages from admins only. */
  async assertCanPostInTopic(userId: string, chatId: string, topicId: string): Promise<void> {
    const topic = await this.prisma.topic.findFirst({
      where: { id: topicId, chatId },
      include: { chat: { select: { isForum: true } } },
    });
    if (!topic || !topic.chat.isForum) {
      throw new NotFoundException({ message: 'Topic not found.', code: 'TOPIC_NOT_FOUND' });
    }
    if (!topic.isClosed) return;
    const member = await this.prisma.chatMember.findFirst({ where: { chatId, userId } });
    if (member?.role !== ChatMemberRole.OWNER && member?.role !== ChatMemberRole.ADMIN) {
      throw new ForbiddenException({ message: 'This topic is closed.', code: 'TOPIC_CLOSED' });
    }
  }

  async sendMessage(userId: string, chatId: string, dto: SendMessageDto) {
    await this.assertCanPost(userId, chatId);

    const chatMeta = await this.prisma.chat.findUnique({
      where: { id: chatId },
      select: { type: true, e2ee: true, keyEpoch: true },
    });
    const isSecret = chatMeta?.type === ChatType.SECRET || !!chatMeta?.e2ee;
    if (dto.topicId) await this.assertCanPostInTopic(userId, chatId, dto.topicId);
    if (isSecret) assertSecretPayload(dto, chatMeta?.e2ee ? { keyEpoch: chatMeta.keyEpoch } : undefined);

    // When the message carries an uploaded object, persist the `MessageMedia`
    // row alongside it. Clients render attachments from `message.media`
    // (mime type, size, url) and `MediaService.getDownloadUrl` relies on it
    // to verify chat membership before handing out a presigned URL.
    const mediaData = dto.mediaId
      ? await this.buildMediaRelation(dto.mediaId, dto.duration, dto.waveform)
      : undefined;

    const message = await this.prisma.message.create({
      data: {
        chatId,
        senderId: userId,
        topicId: dto.topicId,
        type: dto.type,
        content: dto.content || '',
        entities: dto.entities ? (validateEntities(dto.content || '', dto.entities) as any) : undefined,
        mediaId: dto.mediaId,
        replyToMessageId: dto.replyToMessageId,
        status: MessageStatus.SENT,
        ...(mediaData ? { media: mediaData } : {}),
      },
      include: {
        sender: { select: PUBLIC_USER_SELECT },
        media: true,
        replyTo: { include: { sender: { select: PUBLIC_USER_SELECT } } },
      },
    });

    this.metrics.messagesSent.inc({ type: dto.type });

    await this.prisma.chat.update({
      where: { id: chatId },
      data: { updatedAt: new Date() },
    });

    const members = await this.prisma.chatMember.findMany({ where: { chatId } });
    for (const m of members) {
      this.realtime.emitToUser(m.userId, RealtimeEvent.MESSAGE_NEW, {
        chatId,
        message: projectMessage(message, m.userId),
        clientTempId: dto.clientTempId,
        isSelf: m.userId === userId,
      });
    }

    // Bots are third parties and would only ever see ciphertext of a secret chat.
    if (!isSecret) {
      this.dispatchBotUpdate(userId, chatId, {
        event: 'message.new',
        timestamp: Date.now(),
        chatId,
        // Bots are third parties: they only ever get the public view of the sender.
        message: projectMessage(message),
      });
    }

    // Push to the other members. Fire-and-forget on purpose: a slow push
    // provider must never hold up the HTTP response that carries the message.
    const chat = await this.prisma.chat.findUnique({
      where: { id: chatId },
      select: { type: true },
    });
    const sender = message.sender;
    const senderName =
      `${sender?.firstName ?? ''} ${sender?.lastName ?? ''}`.trim() || 'FLUX';

    void this.notifications
      .notifyNewMessage({
        chatId,
        chatType: chat?.type ?? 'PRIVATE',
        senderName,
        // A secret chat's text is ciphertext: a push preview of it would be gibberish
        // and, worse, would put the message into the push provider's hands.
        content: isSecret ? '' : message.content,
        recipientIds: members
          .filter((m) => m.userId !== userId)
          .map((m) => m.userId),
      })
      .catch((err) => this.logger.warn(`Push dispatch failed: ${err}`));

    return projectMessage(message, userId);
  }

  async getHistory(userId: string, chatId: string, query: MessageHistoryQueryDto) {
    await this.checkMembership(userId, chatId);
    const take = query.limit ?? 50;

    const where: any = { chatId, isDeleted: false };
    if (query.topicId) where.topicId = query.topicId === 'general' ? null : query.topicId;
    // Ciphertext cannot be searched, and a match on it would be meaningless.
    const searchable = (
      await this.prisma.chat.findUnique({ where: { id: chatId }, select: { type: true, e2ee: true } })
    );
    const isSearchable = searchable?.type !== ChatType.SECRET && !searchable?.e2ee;
    if (query.q && isSearchable) {
      where.content = { contains: query.q, mode: 'insensitive' };
    }

    const messages = await this.prisma.message.findMany({
      where,
      take,
      cursor: query.cursor ? { id: query.cursor } : undefined,
      skip: query.cursor ? 1 : 0,
      orderBy: { createdAt: 'desc' },
      include: {
        sender: { select: PUBLIC_USER_SELECT },
        media: true,
        replyTo: { include: { sender: { select: PUBLIC_USER_SELECT } } },
        reactions: true,
        pin: { select: { id: true, createdAt: true } },
        // Only used to work out the read status of the viewer's own messages.
        readReceipts: { select: { userId: true } },
      },
    });

    return {
      items: await this.locations.attach(
        await this.comments.attach(
          await this.stickers.attach(
            await this.polls.attach(
              (await applyReadStatus(messages, userId, this.privacy)).map((message) =>
                projectMessage(message, userId),
              ),
              userId,
            ),
          ),
        ),
      ),
      nextCursor: messages.length === take ? messages[messages.length - 1]?.id || null : null,
    };
  }

  async editMessage(userId: string, chatId: string, messageId: string, dto: EditMessageDto) {
    await this.checkMembership(userId, chatId);

    const editedChat = await this.prisma.chat.findUnique({
      where: { id: chatId },
      select: { type: true, e2ee: true, keyEpoch: true },
    });
    const editsSecret = editedChat?.type === ChatType.SECRET || !!editedChat?.e2ee;
    if (editsSecret) {
      assertSecretPayload(
        { content: dto.content, entities: dto.entities },
        editedChat?.e2ee ? { keyEpoch: editedChat.keyEpoch } : undefined,
      );
    }
    const message = await this.prisma.message.findFirst({
      where: { id: messageId, chatId, senderId: userId, isDeleted: false },
    });
    if (!message) throw new NotFoundException('Message not found');

    const updated = await this.prisma.message.update({
      where: { id: messageId },
      data: {
        content: dto.content,
        entities: dto.entities ? (validateEntities(dto.content, dto.entities) as any) : undefined,
        isEdited: true,
      },
      include: { sender: { select: PUBLIC_USER_SELECT }, media: true },
    });

    const members = await this.prisma.chatMember.findMany({ where: { chatId } });
    for (const m of members) {
      this.realtime.emitToUser(m.userId, RealtimeEvent.MESSAGE_UPDATED, {
        chatId,
        message: projectMessage(updated, m.userId),
      });
    }

    this.dispatchBotUpdate(userId, chatId, {
      event: 'message.updated',
      timestamp: Date.now(),
      chatId,
      message: projectMessage(updated),
    });

    return projectMessage(updated, userId);
  }

  async deleteMessage(userId: string, chatId: string, messageId: string, forAll: boolean) {
    await this.checkMembership(userId, chatId);
    const message = await this.prisma.message.findFirst({
      where: { id: messageId, chatId, isDeleted: false },
      include: { chat: { include: { members: true } } },
    });
    if (!message) throw new NotFoundException('Message not found');

    const member = await this.prisma.chatMember.findFirst({ where: { chatId, userId } });
    const isOwner = message.senderId === userId;
    const isAdmin = member?.role === 'OWNER' || member?.role === 'ADMIN';

    if (!isOwner && !(forAll && isAdmin)) {
      throw new ForbiddenException('Cannot delete this message');
    }

    await this.prisma.message.update({
      where: { id: messageId },
      data: { isDeleted: true, content: '' },
    });
    await this.pins.clearForDeletedMessage(chatId, messageId, userId);

    const members = await this.prisma.chatMember.findMany({ where: { chatId } });
    for (const m of members) {
      this.realtime.emitToUser(m.userId, RealtimeEvent.MESSAGE_DELETED, { chatId, messageId });
    }

    this.dispatchBotUpdate(userId, chatId, {
      event: 'message.deleted',
      timestamp: Date.now(),
      chatId,
      messageId,
    });

    return { deleted: true };
  }

  async forwardMessage(userId: string, fromChatId: string, messageId: string, dto: ForwardMessageDto) {
    await this.checkMembership(userId, fromChatId);
    const original = await this.prisma.message.findFirst({
      where: { id: messageId, chatId: fromChatId, isDeleted: false },
    });
    if (!original) throw new NotFoundException('Message not found');

    // Forwarding would copy ciphertext into a chat that cannot decrypt it, or
    // plaintext out of an encrypted one.
    const involved = await this.prisma.chat.findMany({
      where: { id: { in: [fromChatId, ...dto.chatIds] }, OR: [{ type: ChatType.SECRET }, { e2ee: true }] },
      select: { id: true },
    });
    if (involved.length > 0) {
      throw new BadRequestException({
        message: 'Messages cannot be forwarded to or from a secret chat.',
        code: 'SECRET_FORWARD_FORBIDDEN',
      });
    }

    // Respect the original author's "allow forwarding" switch.
    if (!(await this.privacy.allowsForwarding(original.senderId))) {
      throw new ForbiddenException('Forwarding is disabled for this message');
    }

    const forwarded = [];
    for (const targetChatId of dto.chatIds) {
      await this.checkMembership(userId, targetChatId);
      const msg = await this.prisma.message.create({
        data: {
          chatId: targetChatId,
          senderId: userId,
          type: original.type,
          content: original.content,
          entities: original.entities as any,
          mediaId: original.mediaId,
          forwardedFromChatId: fromChatId,
          forwardedFromMessageId: messageId,
          status: MessageStatus.SENT,
        },
        include: { sender: { select: PUBLIC_USER_SELECT }, media: true },
      });
      forwarded.push(msg);

      const members = await this.prisma.chatMember.findMany({ where: { chatId: targetChatId } });
      for (const m of members) {
        this.realtime.emitToUser(m.userId, RealtimeEvent.MESSAGE_NEW, {
          chatId: targetChatId,
          message: projectMessage(msg, m.userId),
          isSelf: m.userId === userId,
        });
      }

      this.dispatchBotUpdate(userId, targetChatId, {
        event: 'message.new',
        timestamp: Date.now(),
        chatId: targetChatId,
        message: projectMessage(msg),
      });
    }

    return { forwarded: forwarded.length };
  }

  async markRead(userId: string, chatId: string, dto: MarkReadDto) {
    await this.checkMembership(userId, chatId);

    if (!dto.upToMessageId && (!dto.messageIds || dto.messageIds.length === 0)) {
      throw new BadRequestException({
        message: 'Provide messageIds or upToMessageId.',
        code: 'READ_TARGET_REQUIRED',
      });
    }

    // Only other people's messages in this chat can be marked read: a sender
    // never reads their own, and ids from other chats are ignored.
    let anchorTime: Date | undefined;
    let unread: Array<{ id: string; createdAt: Date }>;

    if (dto.upToMessageId) {
      const anchor = await this.prisma.message.findFirst({
        where: { id: dto.upToMessageId, chatId },
        select: { createdAt: true },
      });
      if (!anchor) throw new NotFoundException('Message not found');
      anchorTime = anchor.createdAt;

      unread = await this.prisma.message.findMany({
        where: {
          chatId,
          senderId: { not: userId },
          isDeleted: false,
          createdAt: { lte: anchor.createdAt },
          readReceipts: { none: { userId } },
        },
        select: { id: true, createdAt: true },
        take: 500,
      });
    } else {
      unread = await this.prisma.message.findMany({
        where: {
          chatId,
          id: { in: dto.messageIds },
          senderId: { not: userId },
          readReceipts: { none: { userId } },
        },
        select: { id: true, createdAt: true },
      });
    }

    const messageIds = unread.map((message) => message.id);
    if (messageIds.length > 0) {
      await this.prisma.readReceipt.createMany({
        data: messageIds.map((id) => ({ messageId: id, userId })),
        skipDuplicates: true,
      });
    }

    // The read cursor only ever moves forward, so a late or repeated request
    // can not make already-read messages unread again.
    const readUpTo =
      anchorTime ??
      unread.reduce<Date | undefined>(
        (latest, message) => (!latest || message.createdAt > latest ? message.createdAt : latest),
        undefined,
      );
    if (readUpTo) {
      await this.prisma.chatMember.updateMany({
        where: {
          chatId,
          userId,
          OR: [{ lastReadAt: null }, { lastReadAt: { lt: readUpTo } }],
        },
        data: { lastReadAt: readUpTo },
      });
    }

    const member = await this.prisma.chatMember.findFirst({
      where: { chatId, userId },
      select: { lastReadAt: true, joinedAt: true },
    });
    const unreadCount = await this.prisma.message.count({
      where: {
        chatId,
        senderId: { not: userId },
        isDeleted: false,
        createdAt: { gt: member?.lastReadAt ?? member?.joinedAt ?? new Date(0) },
      },
    });

    // The reader's own devices always learn the new counter, whatever their
    // privacy settings say; everybody else only gets read receipts when the
    // reader has not hidden them.
    const showReceipts = await this.privacy.showsReadReceipts(userId);
    const members = await this.prisma.chatMember.findMany({ where: { chatId } });
    for (const m of members) {
      if (m.userId === userId) {
        this.realtime.emitToUser(m.userId, RealtimeEvent.MESSAGE_READ, {
          chatId,
          userId,
          messageIds,
          unreadCount,
        });
      } else if (showReceipts && messageIds.length > 0) {
        this.realtime.emitToUser(m.userId, RealtimeEvent.MESSAGE_READ, {
          chatId,
          userId,
          messageIds,
        });
      }
    }

    return { read: true, count: messageIds.length, unreadCount };
  }

  async react(userId: string, chatId: string, messageId: string, dto: ReactDto) {
    await this.checkMembership(userId, chatId);
    
    const existing = await this.prisma.messageReaction.findUnique({
      where: { messageId_userId: { messageId, userId } },
    });

    if (existing) {
      if (existing.emoji === dto.emoji) {
        await this.prisma.messageReaction.delete({ where: { id: existing.id } });
      } else {
        await this.prisma.messageReaction.update({
          where: { id: existing.id },
          data: { emoji: dto.emoji },
        });
      }
    } else {
      await this.prisma.messageReaction.create({
        data: { messageId, userId, emoji: dto.emoji },
      });
    }

    const reactions = await this.prisma.messageReaction.findMany({ where: { messageId } });
    const members = await this.prisma.chatMember.findMany({ where: { chatId } });
    for (const m of members) {
      this.realtime.emitToUser(m.userId, RealtimeEvent.MESSAGE_UPDATED, {
        chatId,
        messageId,
        reactions,
      });
    }

    return { reacted: true };
  }
}
