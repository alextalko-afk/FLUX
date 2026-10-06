import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { ChatMemberRole, ChatType, RealtimeEvent } from '@FLUX/shared';
import { AdminLogService } from './admin-log.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { PUBLIC_USER_SELECT, projectChat } from '../privacy/public-user';

/** 16 random bytes encode to 22 URL-safe characters: 128 bits, not guessable. */
const TOKEN_BYTES = 16;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

/**
 * Invite links for groups and channels.
 *
 * A link is a bearer token: whoever has it can join, so it can be rotated
 * (the old one stops working at once) or revoked by an owner or administrator.
 * Private, saved and secret chats have no invite links.
 */
@Injectable()
export class InvitesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
    private readonly adminLog: AdminLogService,
  ) {}

  private async requireManagedSharedChat(userId: string, chatId: string) {
    const member = await this.prisma.chatMember.findFirst({
      where: { chatId, userId },
      include: { chat: { select: { type: true } } },
    });
    if (!member) throw new NotFoundException('Chat not found or access denied');

    if (member.chat.type !== ChatType.GROUP && member.chat.type !== ChatType.CHANNEL) {
      throw new BadRequestException({
        message: 'Invite links are only available for groups and channels.',
        code: 'INVITE_NOT_SUPPORTED',
      });
    }

    if (member.role !== ChatMemberRole.OWNER && member.role !== ChatMemberRole.ADMIN) {
      throw new ForbiddenException({
        message: 'Only administrators can manage the invite link.',
        code: 'INVITE_NOT_ALLOWED',
      });
    }
  }

  async getLink(userId: string, chatId: string) {
    await this.requireManagedSharedChat(userId, chatId);
    const chat = await this.prisma.chat.findUnique({
      where: { id: chatId },
      select: { inviteLink: true },
    });
    return { token: chat?.inviteLink ?? null };
  }

  /** Creates a link, or replaces the current one so the old URL stops working. */
  async rotateLink(userId: string, chatId: string) {
    await this.requireManagedSharedChat(userId, chatId);
    const token = randomBytes(TOKEN_BYTES).toString('base64url');

    await this.prisma.chat.update({ where: { id: chatId }, data: { inviteLink: token } });
    await this.adminLog.record(chatId, userId, 'invite.rotated');
    return { token };
  }

  async revokeLink(userId: string, chatId: string) {
    await this.requireManagedSharedChat(userId, chatId);
    await this.prisma.chat.update({ where: { id: chatId }, data: { inviteLink: null } });
    await this.adminLog.record(chatId, userId, 'invite.revoked');
    return { token: null };
  }

  /**
   * What the invite page shows before the person decides to join. The chat id
   * is only revealed to people who are already members.
   */
  async preview(userId: string, token: string) {
    const chat = await this.findByToken(token);
    const membership = await this.prisma.chatMember.findFirst({
      where: { chatId: chat.id, userId },
      select: { id: true },
    });

    return {
      chatId: membership ? chat.id : null,
      type: chat.type,
      title: chat.title,
      description: chat.description,
      avatarUrl: chat.avatarUrl,
      memberCount: chat._count.members,
      alreadyMember: Boolean(membership),
    };
  }

  async join(userId: string, token: string) {
    const chat = await this.findByToken(token);

    const existing = await this.prisma.chatMember.findFirst({
      where: { chatId: chat.id, userId },
      select: { id: true },
    });
    if (existing) return { chatId: chat.id, joined: false };

    if (chat.joinApproval) {
      await this.prisma.joinRequest.upsert({
        where: { chatId_userId: { chatId: chat.id, userId } },
        update: {},
        create: { chatId: chat.id, userId },
      });
      return { chatId: null, joined: false, pending: true };
    }

    await this.admit(chat.id, userId);
    return { chatId: chat.id, joined: true, pending: false };
  }

  /** Adds the person as an ordinary member and tells everyone involved. */
  private async admit(chatId: string, userId: string) {
    const chat = { id: chatId };
    await this.prisma.chatMember.create({
      data: { chatId: chat.id, userId, role: ChatMemberRole.MEMBER },
    });

    const full = await this.prisma.chat.findUnique({
      where: { id: chat.id },
      include: { members: { include: { user: { select: PUBLIC_USER_SELECT } } } },
    });

    if (full) {
      // The newcomer receives the chat; everybody else learns that someone joined.
      this.realtime.emitToUser(userId, RealtimeEvent.CHAT_CREATED, projectChat(full, userId));
      for (const member of full.members) {
        if (member.userId === userId) continue;
        this.realtime.emitToUser(member.userId, RealtimeEvent.CHAT_MEMBER_ADDED, {
          chatId: chat.id,
          userId,
        });
        this.realtime.emitToUser(member.userId, RealtimeEvent.CHAT_UPDATED, projectChat(full, member.userId));
      }
    }

  }

  /** Administrator view of what was done in the chat. */
  async adminLogFor(userId: string, chatId: string, limit: number, cursor?: string) {
    await this.requireManagedSharedChat(userId, chatId);
    return this.adminLog.list(chatId, limit, cursor);
  }

  async listRequests(userId: string, chatId: string) {
    await this.requireManagedSharedChat(userId, chatId);
    const items = await this.prisma.joinRequest.findMany({
      where: { chatId },
      orderBy: { createdAt: 'asc' },
      include: { user: { select: PUBLIC_USER_SELECT } },
    });
    return { items };
  }

  async approve(userId: string, chatId: string, requesterId: string) {
    await this.requireManagedSharedChat(userId, chatId);
    const removed = await this.prisma.joinRequest.deleteMany({ where: { chatId, userId: requesterId } });
    if (removed.count === 0) throw new NotFoundException('Request not found');
    const already = await this.prisma.chatMember.findFirst({ where: { chatId, userId: requesterId } });
    if (!already) await this.admit(chatId, requesterId);
    await this.adminLog.record(chatId, userId, 'join.approved', requesterId);
    return { approved: true };
  }

  async reject(userId: string, chatId: string, requesterId: string) {
    await this.requireManagedSharedChat(userId, chatId);
    const removed = await this.prisma.joinRequest.deleteMany({ where: { chatId, userId: requesterId } });
    if (removed.count === 0) throw new NotFoundException('Request not found');
    await this.adminLog.record(chatId, userId, 'join.rejected', requesterId);
    return { rejected: true };
  }

  private async findByToken(token: string) {
    // A malformed token and an unknown one look the same, so the endpoint
    // gives nothing away about which links exist.
    if (!TOKEN_PATTERN.test(token)) {
      throw new NotFoundException({ message: 'Invite link is not valid.', code: 'INVITE_INVALID' });
    }

    const chat = await this.prisma.chat.findUnique({
      where: { inviteLink: token },
      include: { _count: { select: { members: true } } },
    });

    if (!chat || chat.isArchived) {
      throw new NotFoundException({ message: 'Invite link is not valid.', code: 'INVITE_INVALID' });
    }
    return chat;
  }
}
