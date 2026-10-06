import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ChatMemberRole, ChatType, RealtimeEvent } from '@FLUX/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { PUBLIC_USER_SELECT, projectMessage } from '../privacy/public-user';

/** More pinned messages than this stops being a "pinned" list. */
export const MAX_PINNED_PER_CHAT = 20;

/**
 * Pinned messages of a chat.
 *
 * Who may pin follows the chat type: in a private, saved or secret chat every
 * member may; in a group or channel only the owner and administrators, since
 * the pinned message is shown to everybody.
 */
@Injectable()
export class PinsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
  ) {}

  private async requireMember(userId: string, chatId: string) {
    const member = await this.prisma.chatMember.findFirst({
      where: { chatId, userId },
      include: { chat: { select: { type: true, e2ee: true } } },
    });
    if (!member) throw new NotFoundException('Chat not found or access denied');
    return member;
  }

  private async requireCanPin(userId: string, chatId: string) {
    const member = await this.requireMember(userId, chatId);
    if (member.chat.type === ChatType.SECRET || member.chat.e2ee) {
      // The pinned bar would show ciphertext, and the server must not learn which message matters.
      throw new BadRequestException({
        message: 'Messages cannot be pinned in a secret chat.',
        code: 'PIN_NOT_SUPPORTED',
      });
    }

    const shared = member.chat.type === ChatType.GROUP || member.chat.type === ChatType.CHANNEL;
    const isManager =
      member.role === ChatMemberRole.OWNER || member.role === ChatMemberRole.ADMIN;

    if (shared && !isManager) {
      throw new ForbiddenException({
        message: 'Only administrators can pin messages in this chat.',
        code: 'PIN_NOT_ALLOWED',
      });
    }
  }

  async list(userId: string, chatId: string) {
    await this.requireMember(userId, chatId);

    const pins = await this.prisma.pinnedMessage.findMany({
      where: { chatId, message: { isDeleted: false } },
      orderBy: { createdAt: 'desc' },
      include: {
        message: {
          include: {
            sender: { select: PUBLIC_USER_SELECT },
            media: true,
            reactions: true,
          },
        },
      },
    });

    return {
      items: pins.map((pin) => ({
        id: pin.id,
        pinnedAt: pin.createdAt,
        pinnedById: pin.pinnedById,
        message: projectMessage(pin.message, userId),
      })),
    };
  }

  async pin(userId: string, chatId: string, messageId: string) {
    await this.requireCanPin(userId, chatId);

    const message = await this.prisma.message.findFirst({
      where: { id: messageId, chatId, isDeleted: false },
      select: { id: true },
    });
    if (!message) throw new NotFoundException('Message not found');

    const already = await this.prisma.pinnedMessage.findUnique({ where: { messageId } });
    if (already) return { pinned: true };

    const count = await this.prisma.pinnedMessage.count({ where: { chatId } });
    if (count >= MAX_PINNED_PER_CHAT) {
      throw new BadRequestException({
        message: `A chat can have at most ${MAX_PINNED_PER_CHAT} pinned messages.`,
        code: 'PIN_LIMIT_REACHED',
      });
    }

    await this.prisma.pinnedMessage.create({ data: { chatId, messageId, pinnedById: userId } });
    await this.notify(chatId, messageId, true, userId);

    return { pinned: true };
  }

  async unpin(userId: string, chatId: string, messageId: string) {
    await this.requireCanPin(userId, chatId);

    const { count } = await this.prisma.pinnedMessage.deleteMany({ where: { chatId, messageId } });
    if (count > 0) await this.notify(chatId, messageId, false, userId);

    return { pinned: false };
  }

  /** Removes the pin of a deleted message and tells the members. */
  async clearForDeletedMessage(chatId: string, messageId: string, actorId: string) {
    const { count } = await this.prisma.pinnedMessage.deleteMany({ where: { chatId, messageId } });
    if (count > 0) await this.notify(chatId, messageId, false, actorId);
  }

  private async notify(chatId: string, messageId: string, isPinned: boolean, actorId: string) {
    const members = await this.prisma.chatMember.findMany({
      where: { chatId },
      select: { userId: true },
    });

    for (const member of members) {
      this.realtime.emitToUser(member.userId, RealtimeEvent.MESSAGE_PIN_UPDATED, {
        chatId,
        messageId,
        isPinned,
        pinnedById: actorId,
      });
    }
  }
}
