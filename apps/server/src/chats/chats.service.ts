import { AdminLogService } from './admin-log.service';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { PrivacyService } from '../privacy/privacy.service';
import { PUBLIC_USER_SELECT, projectChat, projectMessage } from '../privacy/public-user';
import { Prisma } from '@prisma/client';
import { applyReadStatus } from '../messages/read-status';
import {
  CreateGroupDto,
  CreateChannelDto,
  CreatePrivateChatDto,
  CreateSecretChatDto,
  UpdateChatDto,
  AddMembersDto,
  ChatListQueryDto,
} from './dto/chats.dto';
import { ChatMemberRole, ChatType, RealtimeEvent } from '@FLUX/shared';

/** Members with only the user fields that may be shown to other accounts. */
const MEMBERS_INCLUDE = {
  members: { include: { user: { select: PUBLIC_USER_SELECT } } },
} as const;

/** More pinned chats than this defeats the purpose of pinning. */
export const MAX_PINNED_CHATS = 10;

@Injectable()
export class ChatsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly realtime: RealtimeGateway,
    private readonly privacy: PrivacyService,
    private readonly adminLog: AdminLogService,
  ) {}

  /**
   * Sends a chat to one recipient with every member's profile filtered by that
   * recipient's view: the same chat is shown differently to two people when a
   * member hides their photo or last-seen time from only one of them.
   */
  private emitChat(recipientId: string, event: RealtimeEvent, chat: any) {
    this.realtime.emitToUser(recipientId, event, projectChat(chat, recipientId));
  }

  private async getUserOrThrow(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.isBlocked) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  private async checkBlocked(userId1: string, userId2: string): Promise<void> {
    const block = await this.prisma.blockedUser.findFirst({
      where: {
        OR: [
          { ownerId: userId1, targetId: userId2 },
          { ownerId: userId2, targetId: userId1 },
        ],
      },
    });
    if (block) {
      throw new ForbiddenException({
        message: 'Cannot start chat due to privacy restrictions.',
        code: 'BLOCKED_USER',
      });
    }
  }

  async createPrivateChat(userId: string, dto: CreatePrivateChatDto) {
    if (userId === dto.targetUserId) {
      const savedMessages = await this.prisma.chat.findFirst({
        where: {
          type: ChatType.SAVED,
          members: { some: { userId } },
        },
        include: { members: true },
      });
      if (savedMessages) {
        // Same idempotency rationale as for private chats: make sure every
        // device of the user receives the saved-messages chat on request.
        this.emitChat(userId, RealtimeEvent.CHAT_CREATED, savedMessages);
        return savedMessages;
      }

      const chat = await this.prisma.chat.create({
        data: {
          type: ChatType.SAVED,
          members: { create: { userId, role: ChatMemberRole.OWNER } },
        },
        include: { members: true },
      });
      this.emitChat(userId, RealtimeEvent.CHAT_CREATED, chat);
      return chat;
    }

    await this.getUserOrThrow(dto.targetUserId);
    await this.checkBlocked(userId, dto.targetUserId);

    if (!(await this.privacy.allowsMessages(dto.targetUserId))) {
      throw new ForbiddenException('This user does not accept new messages');
    }

    // Concurrent requests for the same pair (double submit, two devices) must
    // not both pass the existence check and then race on the insert.
    const pairKey = [userId, dto.targetUserId].sort().join(':');
    const { existing, created } = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${pairKey}))`;
      const found = await tx.chat.findFirst({
        where: {
          type: ChatType.PRIVATE,
          AND: [
            { members: { some: { userId } } },
            { members: { some: { userId: dto.targetUserId } } },
          ],
        },
      });
      if (found) return { existing: found, created: null };
      const chat = await tx.chat.create({
        data: {
          type: ChatType.PRIVATE,
          members: {
            create: [
              { userId, role: ChatMemberRole.MEMBER },
              { userId: dto.targetUserId, role: ChatMemberRole.MEMBER },
            ],
          },
        },
        include: MEMBERS_INCLUDE,
      });
      return { existing: null, created: chat };
    });

    if (existing) {
      // `createPrivateChat` is idempotent: if the dialog already exists we
      // still push `chat.created` to BOTH members so that every device of
      // both users converges (clients treat this event as an upsert).
      const existingWithMembers = await this.prisma.chat.findUnique({
        where: { id: existing.id },
        include: MEMBERS_INCLUDE,
      });
      const chatForClients = existingWithMembers ?? existing;

      this.emitChat(userId, RealtimeEvent.CHAT_CREATED, chatForClients);
      this.emitChat(dto.targetUserId, RealtimeEvent.CHAT_CREATED, chatForClients);

      return projectChat(chatForClients as any, userId);
    }

    const chat = created!;
    this.emitChat(userId, RealtimeEvent.CHAT_CREATED, chat);
    this.emitChat(dto.targetUserId, RealtimeEvent.CHAT_CREATED, chat);

    return projectChat(chat, userId);
  }

  async createGroup(userId: string, dto: CreateGroupDto) {
    const uniqueMembers = Array.from(new Set([userId, ...dto.memberIds]));
    if (uniqueMembers.length < 2) {
      throw new BadRequestException('Group must have at least 2 members');
    }

    const users = await this.prisma.user.findMany({
      where: { id: { in: uniqueMembers }, isBlocked: false },
    });
    if (users.length !== uniqueMembers.length) {
      throw new NotFoundException('One or more users not found');
    }

    for (const memberId of uniqueMembers) {
      if (memberId === userId) continue;
      if (!(await this.privacy.allowsGroupInvites(memberId))) {
        throw new ForbiddenException('One or more users do not accept group invites');
      }
    }

    if (dto.e2ee) {
      const mine = await this.prisma.deviceKey.findFirst({ where: { userId, revokedAt: null } });
      if (!mine) {
        throw new ConflictException({
          message: 'Set up encryption on this device first (it creates your device key).',
          code: 'E2EE_NO_DEVICE_KEY',
        });
      }
    }

    const chat = await this.prisma.chat.create({
      data: {
        type: ChatType.GROUP,
        e2ee: !!dto.e2ee,
        title: dto.title,
        description: dto.description || null,
        isPublic: false,
        members: {
          create: uniqueMembers.map((id) => ({
            userId: id,
            role: id === userId ? ChatMemberRole.OWNER : ChatMemberRole.MEMBER,
          })),
        },
      },
      include: MEMBERS_INCLUDE,
    });

    for (const memberId of uniqueMembers) {
      this.emitChat(memberId, RealtimeEvent.CHAT_CREATED, chat);
    }

    return projectChat(chat, userId);
  }

  async createChannel(userId: string, dto: CreateChannelDto) {
    const chat = await this.prisma.chat.create({
      data: {
        type: ChatType.CHANNEL,
        title: dto.title,
        description: dto.description || null,
        isPublic: dto.isPublic ?? false,
        members: {
          create: [{ userId, role: ChatMemberRole.OWNER }],
        },
      },
      include: MEMBERS_INCLUDE,
    });

    this.emitChat(userId, RealtimeEvent.CHAT_CREATED, chat);
    return projectChat(chat, userId);
  }

  /** Include shared by every query that produces a chat-list entry. */
  private listInclude() {
    return {
      members: { include: { user: { select: PUBLIC_USER_SELECT } } },
      messages: {
        // A message deleted for everyone must not stay as the chat preview.
        where: { isDeleted: false },
        take: 1,
        orderBy: { createdAt: 'desc' as const },
        include: {
          sender: { select: PUBLIC_USER_SELECT },
          readReceipts: { select: { userId: true } },
        },
      },
    };
  }

  /**
   * Unread messages per chat for one user: messages from other people that are
   * newer than the member's read cursor. One grouped query for the whole page,
   * not one per chat.
   */
  private async unreadCounts(userId: string, chatIds: string[]): Promise<Map<string, number>> {
    const counts = new Map<string, number>();
    if (chatIds.length === 0) return counts;

    const rows = await this.prisma.$queryRaw<Array<{ chatId: string; count: number }>>(Prisma.sql`
      SELECT m."chatId" AS "chatId", COUNT(*)::int AS "count"
      FROM "Message" m
      JOIN "ChatMember" cm ON cm."chatId" = m."chatId" AND cm."userId" = ${userId}
      WHERE m."chatId" IN (${Prisma.join(chatIds)})
        AND m."senderId" <> ${userId}
        AND m."isDeleted" = false
        AND m."createdAt" > COALESCE(cm."lastReadAt", cm."joinedAt")
      GROUP BY m."chatId"
    `);

    for (const row of rows) counts.set(row.chatId, row.count);
    return counts;
  }

  /** The shape the client renders in its chat list, for one viewer. */
  private async toListItems(userId: string, chats: any[]) {
    const unread = await this.unreadCounts(
      userId,
      chats.map((chat) => chat.id),
    );

    // The preview of a message the caller sent shows whether it was read.
    const previews = chats.flatMap((chat) => (chat.messages ?? []).slice(0, 1));
    const resolved = await applyReadStatus(previews, userId, this.privacy);
    const resolvedById = new Map(resolved.map((message: any) => [message.id, message]));

    return chats.map((chat) => {
      const { messages, ...rest } = chat;
      const mine = chat.members.find((member: any) => member.userId === userId);
      const last = messages?.[0] ? resolvedById.get(messages[0].id) : undefined;

      return {
        ...projectChat(rest, userId),
        lastMessage: last ? projectMessage(last, userId) : null,
        unreadCount: unread.get(chat.id) ?? 0,
        isPinned: Boolean(mine?.isPinned),
        pinnedAt: mine?.pinnedAt ?? null,
        isArchived: Boolean(mine?.isArchived),
        isMuted: Boolean(mine?.isMuted),
      };
    });
  }

  async listChats(userId: string, query: ChatListQueryDto) {
    const take = query.limit ?? 50;
    const archived = query.archived === true;

    if (query.folderId) {
      const folder = await this.prisma.chatFolder.findFirst({
        where: { id: query.folderId, userId },
        select: { id: true },
      });
      if (!folder) throw new NotFoundException('Folder not found');
    }

    const base: Prisma.ChatWhereInput = {
      // Chats placed on moderation hold by an administrator are hidden from the
      // regular list. Their history and membership are preserved.
      isArchived: false,
      ...(query.type ? { type: query.type } : {}),
      ...(query.folderId ? { folderAssignments: { some: { folderId: query.folderId } } } : {}),
    };

    // Pinned chats lead the first page of the main list; later pages continue
    // with the unpinned ones, so pagination never has to interleave the two.
    const pinned =
      !query.cursor && !archived
        ? await this.prisma.chat.findMany({
            where: { ...base, members: { some: { userId, isPinned: true, isArchived: false } } },
            include: this.listInclude(),
          })
        : [];
    pinned.sort((a, b) => {
      const at = a.members.find((m) => m.userId === userId)?.pinnedAt?.getTime() ?? 0;
      const bt = b.members.find((m) => m.userId === userId)?.pinnedAt?.getTime() ?? 0;
      return bt - at;
    });

    const rest = await this.prisma.chat.findMany({
      where: { ...base, members: { some: { userId, isPinned: false, isArchived: archived } } },
      take,
      cursor: query.cursor ? { id: query.cursor } : undefined,
      skip: query.cursor ? 1 : 0,
      orderBy: { updatedAt: 'desc' },
      include: this.listInclude(),
    });

    return {
      items: await this.toListItems(userId, [...pinned, ...rest]),
      nextCursor: rest.length === take ? rest[rest.length - 1]?.id || null : null,
    };
  }

  /** One chat in list shape, e.g. to push to the caller's other devices. */
  async getListItem(userId: string, chatId: string) {
    const chat = await this.prisma.chat.findFirst({
      where: { id: chatId, members: { some: { userId } } },
      include: this.listInclude(),
    });
    if (!chat) throw new NotFoundException('Chat not found or access denied');
    return (await this.toListItems(userId, [chat]))[0];
  }

  /** Pins or unpins a chat in the caller's own list. */
  async setPinned(userId: string, chatId: string, isPinned: boolean) {
    const member = await this.prisma.chatMember.findFirst({ where: { chatId, userId } });
    if (!member) throw new NotFoundException('Not a member');

    if (isPinned && !member.isPinned) {
      const count = await this.prisma.chatMember.count({
        where: { userId, isPinned: true, isArchived: false },
      });
      if (count >= MAX_PINNED_CHATS) {
        throw new BadRequestException({
          message: `You can pin at most ${MAX_PINNED_CHATS} chats.`,
          code: 'PINNED_CHATS_LIMIT',
        });
      }
    }

    await this.prisma.chatMember.update({
      where: { id: member.id },
      // An archived chat cannot be pinned: pinning brings it back to the main list.
      data: {
        isPinned,
        pinnedAt: isPinned ? new Date() : null,
        ...(isPinned ? { isArchived: false } : {}),
      },
    });

    await this.pushListItem(userId, chatId);
    return { isPinned };
  }

  /** Moves a chat to or from the caller's archive. */
  async setArchived(userId: string, chatId: string, isArchived: boolean) {
    const member = await this.prisma.chatMember.findFirst({ where: { chatId, userId } });
    if (!member) throw new NotFoundException('Not a member');

    await this.prisma.chatMember.update({
      where: { id: member.id },
      data: { isArchived, ...(isArchived ? { isPinned: false, pinnedAt: null } : {}) },
    });

    await this.pushListItem(userId, chatId);
    return { isArchived };
  }

  /** Sends the caller's devices the current list entry of a chat. */
  private async pushListItem(userId: string, chatId: string) {
    const item = await this.getListItem(userId, chatId).catch(() => null);
    if (item) this.realtime.emitToUser(userId, RealtimeEvent.CHAT_UPDATED, item);
  }

  async getChat(userId: string, chatId: string) {
    return projectChat(await this.getChatRaw(userId, chatId), userId);
  }

  /** Unprojected chat: only for code that projects per recipient itself. */
  private async getChatRaw(userId: string, chatId: string) {
    const chat = await this.prisma.chat.findFirst({
      where: { id: chatId, members: { some: { userId } } },
      include: {
        members: { include: { user: { select: PUBLIC_USER_SELECT } }, orderBy: { joinedAt: 'asc' } },
        _count: { select: { messages: true } },
      },
    });
    if (!chat) throw new NotFoundException('Chat not found or access denied');
    return chat;
  }

  /** Mutes/unmutes the chat for the current member only. */
  async setMuted(userId: string, chatId: string, isMuted: boolean) {
    const member = await this.prisma.chatMember.findFirst({
      where: { chatId, userId },
    });
    if (!member) throw new NotFoundException('Not a member');

    await this.prisma.chatMember.update({ where: { id: member.id }, data: { isMuted } });
    await this.pushListItem(userId, chatId);
    return { isMuted };
  }

  private async requireManager(userId: string, chatId: string) {
    const member = await this.prisma.chatMember.findFirst({
      where: { chatId, userId, role: { in: [ChatMemberRole.OWNER, ChatMemberRole.ADMIN] } },
    });
    if (!member) throw new ForbiddenException('Not authorized to manage members');
    return member;
  }

  /** Removes a member. Owners cannot be removed and the actor cannot self-remove. */
  async removeMember(userId: string, chatId: string, targetId: string) {
    await this.requireManager(userId, chatId);

    if (userId === targetId) {
      throw new BadRequestException('Use "leave" to remove yourself from the chat');
    }

    const target = await this.prisma.chatMember.findFirst({
      where: { chatId, userId: targetId },
    });
    if (!target) throw new NotFoundException('Not a member of this chat');
    if (target.role === ChatMemberRole.OWNER) {
      throw new ForbiddenException('The chat owner cannot be removed');
    }

    // An admin may not remove another admin; only the owner can.
    const actor = await this.prisma.chatMember.findFirst({ where: { chatId, userId } });
    if (actor?.role === ChatMemberRole.ADMIN && target.role === ChatMemberRole.ADMIN) {
      throw new ForbiddenException('Only the owner can remove an administrator');
    }

    await this.prisma.chatMember.delete({ where: { id: target.id } });
    await this.adminLog.record(chatId, userId, 'member.removed', targetId);
    this.realtime.emitToUser(targetId, RealtimeEvent.CHAT_DELETED, { chatId });

    return { removed: true };
  }

  /** Promotes/demotes a member. Only the owner can change roles. */
  async setMemberRole(userId: string, chatId: string, targetId: string, role: ChatMemberRole) {
    const actor = await this.prisma.chatMember.findFirst({ where: { chatId, userId } });
    if (actor?.role !== ChatMemberRole.OWNER) {
      throw new ForbiddenException('Only the owner can change member roles');
    }
    if (role === ChatMemberRole.OWNER) {
      throw new BadRequestException('Ownership transfer is not supported');
    }

    const target = await this.prisma.chatMember.findFirst({
      where: { chatId, userId: targetId },
    });
    if (!target) throw new NotFoundException('Not a member of this chat');
    if (target.role === ChatMemberRole.OWNER) {
      throw new ForbiddenException("The owner's role cannot be changed");
    }

    await this.prisma.chatMember.update({ where: { id: target.id }, data: { role } });
    await this.adminLog.record(chatId, userId, 'member.role', targetId, { from: target.role, to: role });

    const chat = await this.getChatRaw(userId, chatId);
    for (const m of chat.members) {
      this.emitChat(m.userId, RealtimeEvent.CHAT_UPDATED, chat);
    }

    return { role };
  }

  async updateChat(userId: string, chatId: string, dto: UpdateChatDto) {
    const member = await this.prisma.chatMember.findFirst({
      where: { chatId, userId, role: { in: [ChatMemberRole.OWNER, ChatMemberRole.ADMIN] } },
    });
    if (!member) throw new ForbiddenException('Not authorized to update chat');
    if (dto.commentsEnabled !== undefined) {
      const type = (await this.prisma.chat.findUnique({ where: { id: chatId }, select: { type: true } }))?.type;
      if (type !== ChatType.CHANNEL) throw new BadRequestException('Comments are only available in channels');
    }
    if (dto.isForum !== undefined) {
      const type = (await this.prisma.chat.findUnique({ where: { id: chatId }, select: { type: true } }))?.type;
      if (type !== ChatType.GROUP) throw new BadRequestException('Topics are only available in groups');
    }
    if (dto.slowModeSeconds !== undefined) {
      const type = (await this.prisma.chat.findUnique({ where: { id: chatId }, select: { type: true } }))?.type;
      if (type !== ChatType.GROUP) throw new BadRequestException('Slow mode is only available in groups');
    }

    const chat = await this.prisma.chat.update({
      where: { id: chatId },
      data: {
        title: dto.title,
        description: dto.description,
        isPublic: dto.isPublic,
        slowModeSeconds: dto.slowModeSeconds,
        joinApproval: dto.joinApproval,
        isForum: dto.isForum,
        commentsEnabled: dto.commentsEnabled,
      },
      include: MEMBERS_INCLUDE,
    });

    await this.adminLog.record(chatId, userId, 'chat.updated', undefined, {
      changed: Object.entries(dto).filter(([, value]) => value !== undefined).map(([key]) => key),
    });

    const members = await this.prisma.chatMember.findMany({ where: { chatId } });
    for (const m of members) {
      this.emitChat(m.userId, RealtimeEvent.CHAT_UPDATED, chat);
    }

    return projectChat(chat, userId);
  }

  async addMembers(userId: string, chatId: string, dto: AddMembersDto) {
    const member = await this.prisma.chatMember.findFirst({
      where: { chatId, userId, role: { in: [ChatMemberRole.OWNER, ChatMemberRole.ADMIN] } },
    });
    if (!member) throw new ForbiddenException('Not authorized to add members');

    const chat = await this.prisma.chat.findUnique({ where: { id: chatId } });
    if (!chat || chat.type === ChatType.PRIVATE || chat.type === ChatType.SAVED) {
      throw new BadRequestException('Cannot add members to this chat type');
    }

    const users = await this.prisma.user.findMany({
      where: { id: { in: dto.userIds }, isBlocked: false },
    });
    if (users.length !== dto.userIds.length) {
      throw new NotFoundException('One or more users not found');
    }

    for (const memberId of dto.userIds) {
      if (!(await this.privacy.allowsGroupInvites(memberId))) {
        throw new ForbiddenException('One or more users do not accept group invites');
      }
    }

    await this.prisma.chatMember.createMany({
      data: dto.userIds.map((id) => ({
        chatId,
        userId: id,
        role: ChatMemberRole.MEMBER,
      })),
      skipDuplicates: true,
    });
    for (const id of dto.userIds) await this.adminLog.record(chatId, userId, 'member.added', id);

    const updatedChat = await this.getChatRaw(userId, chatId);
    for (const id of dto.userIds) {
      this.emitChat(id, RealtimeEvent.CHAT_CREATED, updatedChat);
    }

    return { added: true };
  }

  async leaveChat(userId: string, chatId: string) {
    const member = await this.prisma.chatMember.findFirst({
      where: { chatId, userId },
    });
    if (!member) throw new NotFoundException('Not a member');

    await this.prisma.chatMember.delete({ where: { id: member.id } });

    const remaining = await this.prisma.chatMember.count({ where: { chatId } });
    if (remaining === 0) {
      await this.prisma.chat.delete({ where: { id: chatId } });
    }

    this.realtime.emitToUser(userId, RealtimeEvent.CHAT_DELETED, { chatId });
    return { left: true };
  }

  /**
   * Starts an end-to-end encrypted chat between two specific devices.
   *
   * The server only wires things together: it checks that the caller owns the
   * device key, picks the peer's most recently used device key, records the
   * pair, and from then on stores nothing but ciphertext for this chat. The
   * keys that decrypt it exist only on those two devices.
   */
  async createSecretChat(userId: string, dto: CreateSecretChatDto) {
    if (userId === dto.targetUserId) {
      throw new BadRequestException({
        message: 'A secret chat needs another person.',
        code: 'SECRET_SELF',
      });
    }

    await this.getUserOrThrow(dto.targetUserId);
    await this.checkBlocked(userId, dto.targetUserId);
    if (!(await this.privacy.allowsMessages(dto.targetUserId))) {
      throw new ForbiddenException('This user does not accept new messages');
    }

    const mine = await this.prisma.deviceKey.findFirst({
      where: { id: dto.deviceKeyId, userId, revokedAt: null },
    });
    if (!mine) {
      throw new BadRequestException({
        message: 'This device has no valid key. Register it first.',
        code: 'DEVICE_KEY_INVALID',
      });
    }

    const theirs = await this.prisma.deviceKey.findFirst({
      where: { userId: dto.targetUserId, revokedAt: null },
      orderBy: { lastSeenAt: 'desc' },
    });
    if (!theirs) {
      throw new ConflictException({
        message: 'This person has not set up secret chats on any device yet.',
        code: 'SECRET_PEER_UNAVAILABLE',
      });
    }

    // One secret chat per pair of devices: asking again returns the same chat.
    const existing = await this.prisma.chat.findFirst({
      where: {
        type: ChatType.SECRET,
        AND: [
          { secretBindings: { some: { userId, deviceKeyId: mine.id } } },
          { secretBindings: { some: { userId: dto.targetUserId, deviceKeyId: theirs.id } } },
        ],
      },
      include: MEMBERS_INCLUDE,
    });

    const chat =
      existing ??
      (await this.prisma.chat.create({
        data: {
          type: ChatType.SECRET,
          members: {
            create: [
              { userId, role: ChatMemberRole.MEMBER },
              { userId: dto.targetUserId, role: ChatMemberRole.MEMBER },
            ],
          },
          secretBindings: {
            create: [
              { userId, deviceKeyId: mine.id },
              { userId: dto.targetUserId, deviceKeyId: theirs.id },
            ],
          },
        },
        include: MEMBERS_INCLUDE,
      }));

    this.emitChat(userId, RealtimeEvent.CHAT_CREATED, chat);
    this.emitChat(dto.targetUserId, RealtimeEvent.CHAT_CREATED, chat);

    return projectChat(chat, userId);
  }

  /**
   * The two device public keys a secret chat is bound to, so the client can
   * derive the shared key and show the safety number. Public keys only.
   */
  async getSecretInfo(userId: string, chatId: string) {
    const bindings = await this.prisma.secretChatBinding.findMany({
      where: { chatId, chat: { members: { some: { userId } }, type: ChatType.SECRET } },
      include: { deviceKey: true },
    });

    const self = bindings.find((binding) => binding.userId === userId);
    const peer = bindings.find((binding) => binding.userId !== userId);
    if (!self || !peer) throw new NotFoundException('Secret chat not found');

    const view = (binding: (typeof bindings)[number]) => ({
      userId: binding.userId,
      deviceKeyId: binding.deviceKeyId,
      publicKey: binding.deviceKey.publicKey,
      revoked: binding.deviceKey.revokedAt !== null,
    });

    return { chatId, self: view(self), peer: view(peer) };
  }
}
