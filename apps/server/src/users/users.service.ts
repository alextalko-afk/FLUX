import { RealtimeGateway } from '../realtime/realtime.gateway';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PasswordService } from '../auth/password.service';
import { PrivacyService, DEFAULT_PRIVACY_FLAGS } from '../privacy/privacy.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { SearchUsersQueryDto } from './dto/search-users.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdatePrivacyDto } from '../privacy/dto/privacy.dto';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly privacy: PrivacyService,
    private readonly realtime: RealtimeGateway,
  ) {}

  /**
   * Public projection of a user. `viewerId` is required for anything that can
   * be shown to someone else: it is what makes the owner's privacy switches
   * apply (the owner always sees their own hidden fields).
   */
  private toPublicUser(user: any, viewerId?: string) {
    const visibility = this.privacy.visibilityFor(user, viewerId);
    return {
      id: user.id,
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      bio: visibility.bio ? user.bio : null,
      statusEmoji: user.statusEmoji && (!user.statusUntil || user.statusUntil > new Date()) ? user.statusEmoji : null,
      avatarUrl: visibility.avatarUrl ? user.avatarUrl : null,
      presence: visibility.online ? user.presence : 'OFFLINE',
      lastSeenAt: visibility.lastSeen ? user.lastSeenAt : null,
      isVerified: user.isVerified,
    };
  }

  /** The caller's own privacy switches. */
  async getPrivacySettings(userId: string) {
    return this.privacy.getFlags(userId);
  }

  /** Partially updates the caller's privacy switches. */
  async updatePrivacySettings(userId: string, dto: UpdatePrivacyDto) {
    return this.privacy.updateFlags(userId, dto);
  }

  async getMe(userId: string): Promise<any> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        emails: true,
        phones: true,
        twoFactorCredential: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return {
      id: user.id,
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      bio: user.bio,
      statusEmoji: user.statusEmoji && (!user.statusUntil || user.statusUntil > new Date()) ? user.statusEmoji : null,
      avatarUrl: user.avatarUrl,
      role: user.role,
      presence: user.presence,
      lastSeenAt: user.lastSeenAt,
      isVerified: user.isVerified,
      isBlocked: user.isBlocked,
      emails: user.emails.map((item) => ({
        id: item.id,
        email: item.email,
        isPrimary: item.isPrimary,
        isVerified: item.isVerified,
      })),
      phones: user.phones.map((item) => ({
        id: item.id,
        phone: item.phone,
        isPrimary: item.isPrimary,
        isVerified: item.isVerified,
      })),
      twoFactorEnabled: Boolean(user.twoFactorCredential?.isEnabled),
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  async updateMe(userId: string, dto: UpdateUserDto): Promise<any> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (dto.username) {
      const existingUsername = await this.prisma.user.findUnique({
        where: { username: dto.username },
      });

      if (existingUsername && existingUsername.id !== userId) {
        throw new ConflictException({
          message: 'Username is already taken.',
          code: 'USERNAME_ALREADY_TAKEN',
        });
      }
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: {
        firstName: dto.firstName !== undefined ? dto.firstName.trim() : undefined,
        lastName: dto.lastName !== undefined ? dto.lastName.trim() || null : undefined,
        username: dto.username !== undefined ? dto.username : undefined,
        bio: dto.bio !== undefined ? dto.bio.trim() || null : undefined,
        statusEmoji: dto.statusEmoji !== undefined ? dto.statusEmoji.trim() || null : undefined,
        statusUntil: dto.statusEmoji !== undefined ? (dto.statusEmoji.trim() ? (dto.statusHours ? new Date(Date.now() + dto.statusHours * 3600_000) : null) : null) : undefined,
      },
    });

    return this.toPublicUser(updatedUser, userId);
  }

  /**
   * Replaces the caller's password after verifying the current one.
   *
   * Every *other* session is signed out as a precaution: if the old password
   * leaked, the attacker's session does not survive the rotation. The caller's
   * own session keeps working.
   */
  async changePassword(
    userId: string,
    dto: ChangePasswordDto,
    currentSessionId?: string,
  ): Promise<{ changed: boolean }> {
    const credential = await this.prisma.passwordCredential.findUnique({
      where: { userId },
    });

    if (!credential) {
      throw new NotFoundException({
        message: 'This account has no password set.',
        code: 'PASSWORD_NOT_SET',
      });
    }

    const currentValid = await this.passwordService.verify(
      credential.hash,
      dto.currentPassword,
    );

    if (!currentValid) {
      throw new BadRequestException({
        message: 'Current password is incorrect.',
        code: 'INVALID_CURRENT_PASSWORD',
      });
    }

    const newHash = await this.passwordService.hash(dto.newPassword);

    await this.prisma.passwordCredential.update({
      where: { userId },
      data: { hash: newHash },
    });

    if (currentSessionId) {
      await this.prisma.$transaction([
        this.prisma.session.updateMany({
          where: { userId, id: { not: currentSessionId } },
          data: { isActive: false },
        }),
        this.prisma.refreshToken.updateMany({
          where: { userId, sessionId: { not: currentSessionId } },
          data: { isRevoked: true },
        }),
      ]);
      await this.realtime.enforceActiveSessions(userId);
    }

    return { changed: true };
  }

  /** Login sessions of the caller, most recently active first. */
  async listSessions(
    userId: string,
    currentSessionId?: string,
  ): Promise<{ items: any[] }> {
    const sessions = await this.prisma.session.findMany({
      where: { userId },
      include: { deviceInfo: true },
      orderBy: { lastActiveAt: 'desc' },
    });

    return {
      items: sessions.map((session) => ({
        id: session.id,
        userAgent: session.userAgent,
        ip: session.ip,
        isActive: session.isActive,
        isCurrent: session.id === currentSessionId,
        createdAt: session.createdAt,
        lastActiveAt: session.lastActiveAt,
        deviceInfo: session.deviceInfo
          ? {
              platform: session.deviceInfo.platform,
              browser: session.deviceInfo.browser,
              os: session.deviceInfo.os,
              device: session.deviceInfo.device,
            }
          : null,
      })),
    };
  }

  /**
   * Ends one session and revokes the refresh tokens it issued.
   *
   * The current session is refused on purpose — the UI offers a dedicated
   * logout for that, and terminating it here would silently sign the caller out.
   */
  async terminateSession(
    userId: string,
    sessionId: string,
    currentSessionId?: string,
  ): Promise<{ terminated: boolean }> {
    if (sessionId === currentSessionId) {
      throw new BadRequestException({
        message: 'Use logout to end the current session.',
        code: 'CANNOT_TERMINATE_CURRENT_SESSION',
      });
    }

    const session = await this.prisma.session.findFirst({
      where: { id: sessionId, userId },
    });

    if (!session) {
      throw new NotFoundException({
        message: 'Session not found.',
        code: 'SESSION_NOT_FOUND',
      });
    }

    await this.prisma.$transaction([
      this.prisma.session.update({
        where: { id: sessionId },
        data: { isActive: false },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId, sessionId },
        data: { isRevoked: true },
      }),
    ]);

    await this.realtime.enforceActiveSessions(userId);

    return { terminated: true };
  }

  /** Ends every session except the caller's own. */
  async terminateAllSessions(
    userId: string,
    currentSessionId?: string,
  ): Promise<{ terminated: number }> {
    const sessionWhere: any = { userId, isActive: true };
    const tokenWhere: any = { userId, isRevoked: false };

    if (currentSessionId) {
      sessionWhere.id = { not: currentSessionId };
      // `OR` keeps tokens that predate session linking (a null `sessionId`) in
      // scope, so nothing stale survives the purge.
      tokenWhere.OR = [
        { sessionId: { not: currentSessionId } },
        { sessionId: null },
      ];
    }

    const [sessions] = await this.prisma.$transaction([
      this.prisma.session.updateMany({
        where: sessionWhere,
        data: { isActive: false },
      }),
      this.prisma.refreshToken.updateMany({
        where: tokenWhere,
        data: { isRevoked: true },
      }),
    ]);

    await this.realtime.enforceActiveSessions(userId);

    return { terminated: sessions.count };
  }

  /**
   * Public profile of `targetId` as seen by `viewerId`.
   *
   * Besides the public fields it returns the relationship between the two
   * accounts so the profile screen can render the right primary action
   * (message / add contact / unblock) without extra round-trips.
   */
  async getPublicProfile(viewerId: string, targetId: string): Promise<any> {
    const user = await this.prisma.user.findUnique({
      where: { id: targetId },
      include: { privacySettings: true },
    });

    if (!user || user.isBlocked) {
      throw new NotFoundException({
        message: 'User not found.',
        code: 'USER_NOT_FOUND',
      });
    }

    const isSelf = viewerId === targetId;

    // Everything below is viewer-relative, so it is skipped for "my profile"
    // and pointless when viewing someone you blocked.
    const [contact, blockedByMe, mutualContacts, sharedChats] = isSelf
      ? [null, null, [], []]
      : await Promise.all([
          this.prisma.contact.findUnique({
            where: { ownerId_targetId: { ownerId: viewerId, targetId } },
          }),
          this.prisma.blockedUser.findUnique({
            where: { ownerId_targetId: { ownerId: viewerId, targetId } },
          }),
          // People both viewer and target have saved as contacts.
          this.prisma.contact.count({
            where: {
              ownerId: viewerId,
              target: { contactOf: { some: { ownerId: targetId } } },
            },
          }),
          this.prisma.chat.findMany({
            where: { members: { some: { userId: targetId } }, type: { not: 'SAVED' } },
            select: {
              id: true,
              type: true,
              title: true,
              members: { where: { userId: viewerId }, select: { id: true } },
            },
            take: 5,
          }),
        ]);

    // Interaction permissions are handed to the client so it can disable the
    // call button, forwarding, media saving and P2P before the server has to
    // reject the action.
    const flags = { ...DEFAULT_PRIVACY_FLAGS, ...(user.privacySettings ?? {}) };

    return {
      ...this.toPublicUser(user, viewerId),
      isSelf,
      isContact: Boolean(contact),
      contactId: contact?.id ?? null,
      isBlockedByMe: Boolean(blockedByMe),
      mutualContacts,
      // `members` is only used to keep chats where the viewer is a member.
      sharedChats: (sharedChats as any[])
        .filter((chat) => chat.members.length > 0)
        .map((chat) => ({ id: chat.id, type: chat.type, title: chat.title })),
      privacy: {
        allowCalls: flags.allowCalls,
        allowMessages: flags.allowMessages,
        allowGroupInvites: flags.allowGroupInvites,
        allowForwarding: flags.allowForwarding,
        allowSavingMedia: flags.allowSavingMedia,
        allowP2P: flags.allowP2P,
        showPhoneNumber: flags.showPhoneNumber,
      },
    };
  }

  async search(viewerId: string, query: SearchUsersQueryDto): Promise<{ items: any[]; nextCursor: string | null }> {
    const rawQuery = query.q.trim();
    const normalizedQuery = rawQuery.startsWith('@') ? rawQuery.slice(1) : rawQuery;
    const take = query.limit ?? 20;

    const users = await this.prisma.user.findMany({
      where: {
        isBlocked: false,
        OR: [
          {
            username: {
              contains: normalizedQuery,
              mode: 'insensitive',
            },
          },
          {
            firstName: {
              contains: normalizedQuery,
              mode: 'insensitive',
            },
          },
          {
            lastName: {
              contains: normalizedQuery,
              mode: 'insensitive',
            },
          },
        ],
      },
      orderBy: {
        username: 'asc',
      },
      take,
      cursor: query.cursor ? { id: query.cursor } : undefined,
      skip: query.cursor ? 1 : 0,
      include: { privacySettings: true },
    });

    return {
      items: users.map((user) => this.toPublicUser(user, viewerId)),
      nextCursor: users.length === take ? users[users.length - 1]?.id || null : null,
    };
  }

  async blockUser(actorId: string, targetId: string): Promise<{ blocked: boolean }> {
    if (actorId === targetId) {
      throw new BadRequestException({
        message: 'You cannot block yourself.',
        code: 'CANNOT_BLOCK_SELF',
      });
    }

    const target = await this.prisma.user.findUnique({
      where: { id: targetId },
    });

    if (!target) {
      throw new NotFoundException({
        message: 'User not found.',
        code: 'USER_NOT_FOUND',
      });
    }

    await this.prisma.blockedUser.upsert({
      where: {
        ownerId_targetId: {
          ownerId: actorId,
          targetId,
        },
      },
      create: {
        ownerId: actorId,
        targetId,
      },
      update: {},
    });

    await this.prisma.contact.deleteMany({
      where: {
        ownerId: actorId,
        targetId,
      },
    });

    return { blocked: true };
  }

  async unblockUser(actorId: string, targetId: string): Promise<{ blocked: boolean }> {
    await this.prisma.blockedUser.deleteMany({
      where: {
        ownerId: actorId,
        targetId,
      },
    });

    return { blocked: false };
  }

  async listBlocked(actorId: string): Promise<{ items: any[] }> {
    const records = await this.prisma.blockedUser.findMany({
      where: { ownerId: actorId },
      include: { target: { include: { privacySettings: true } } },
      orderBy: { createdAt: 'desc' },
    });

    return {
      items: records.map((record) => ({
        blockedAt: record.createdAt,
        user: this.toPublicUser(record.target, actorId),
      })),
    };
  }
}
