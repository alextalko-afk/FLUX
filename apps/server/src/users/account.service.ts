import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ChatType, RealtimeEvent, UserRole } from '@FLUX/shared';
import type { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { PasswordService } from '../auth/password.service';
import { TwoFactorService } from '../auth/two-factor.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { PrivacyService } from '../privacy/privacy.service';
import { DeleteAccountDto } from './dto/delete-account.dto';

const DELETED_ACCOUNT_NAME = 'Deleted account';
const EXPORT_BATCH_SIZE = 500;

/**
 * Account lifecycle: deletion and the personal-data export.
 *
 * Deleting an account anonymises the `User` row instead of removing it: other
 * people's chats reference it as the sender of messages, and a hard delete
 * would cascade away their history too. Everything that identifies or
 * authenticates the person is removed, so the row can no longer be used to
 * sign in or be found.
 */
@Injectable()
export class AccountService {
  private readonly logger = new Logger(AccountService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly twoFactorService: TwoFactorService,
    private readonly realtime: RealtimeGateway,
    private readonly privacy: PrivacyService,
  ) {}

  async deleteAccount(userId: string, dto: DeleteAccountDto): Promise<{ deleted: boolean }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { passwordCredential: true, emails: true },
    });

    if (!user || user.deletedAt) {
      throw new NotFoundException({ message: 'Account not found.', code: 'USER_NOT_FOUND' });
    }

    if (!user.passwordCredential) {
      throw new BadRequestException({
        message: 'This account has no password set.',
        code: 'PASSWORD_NOT_SET',
      });
    }

    const passwordValid = await this.passwordService.verify(
      user.passwordCredential.hash,
      dto.password,
    );
    if (!passwordValid) {
      throw new BadRequestException({
        message: 'Current password is incorrect.',
        code: 'INVALID_CURRENT_PASSWORD',
      });
    }

    if (await this.twoFactorService.isEnabled(userId)) {
      if (!dto.totp || !(await this.twoFactorService.verify(userId, dto.totp))) {
        throw new BadRequestException({
          message: 'Invalid two-factor code.',
          code: '2FA_CODE_INVALID',
        });
      }
    }

    if (user.role === UserRole.ADMIN) {
      const otherAdmins = await this.prisma.user.count({
        where: { role: UserRole.ADMIN, id: { not: userId }, isBlocked: false, deletedAt: null },
      });
      if (otherAdmins === 0) {
        throw new ConflictException({
          message: 'The last administrator cannot delete their account.',
          code: 'LAST_ADMIN',
        });
      }
    }

    const memberships = await this.prisma.chatMember.findMany({
      where: { userId },
      select: { chatId: true, role: true, chat: { select: { type: true } } },
    });
    const chatIds = memberships.map((membership) => membership.chatId);

    const coMembers = await this.prisma.chatMember.findMany({
      where: { chatId: { in: chatIds }, userId: { not: userId } },
      select: { userId: true },
      distinct: ['userId'],
    });

    await this.prisma.$transaction(async (tx) => {
      // Hand every group/channel the person owned to someone who stays, so it
      // is not left without an owner. Admins are preferred, then the longest
      // standing member.
      for (const membership of memberships) {
        const ownsSharedChat =
          membership.role === 'OWNER' &&
          (membership.chat.type === ChatType.GROUP || membership.chat.type === ChatType.CHANNEL);
        if (!ownsSharedChat) continue;

        const successor =
          (await tx.chatMember.findFirst({
            where: { chatId: membership.chatId, userId: { not: userId }, role: 'ADMIN' },
            orderBy: { joinedAt: 'asc' },
          })) ??
          (await tx.chatMember.findFirst({
            where: { chatId: membership.chatId, userId: { not: userId } },
            orderBy: { joinedAt: 'asc' },
          }));

        if (successor) {
          await tx.chatMember.update({ where: { id: successor.id }, data: { role: 'OWNER' } });
        }
      }

      if (dto.deleteMessages) {
        await tx.message.updateMany({
          where: { senderId: userId },
          data: { content: '', entities: Prisma.JsonNull, isDeleted: true },
        });
      }

      const emails = user.emails.map((item) => item.email);
      if (emails.length > 0) {
        await tx.verificationCode.deleteMany({ where: { email: { in: emails } } });
      }

      await tx.refreshToken.deleteMany({ where: { userId } });
      await tx.session.deleteMany({ where: { userId } });
      await tx.pushSubscription.deleteMany({ where: { userId } });
      await tx.contact.deleteMany({ where: { OR: [{ ownerId: userId }, { targetId: userId }] } });
      await tx.blockedUser.deleteMany({
        where: { OR: [{ ownerId: userId }, { targetId: userId }] },
      });
      await tx.draft.deleteMany({ where: { userId } });
      await tx.notificationSettings.deleteMany({ where: { userId } });
      await tx.privacySettings.deleteMany({ where: { userId } });
      await tx.bot.deleteMany({ where: { ownerId: userId } });
      await tx.chatMember.deleteMany({ where: { userId } });
      await tx.twoFactorCredential.deleteMany({ where: { userId } });
      // Device keys go with the account; secret chats bound to them become unreadable.
      await tx.deviceKey.deleteMany({ where: { userId } });
      await tx.passwordCredential.deleteMany({ where: { userId } });
      await tx.userPhone.deleteMany({ where: { userId } });
      await tx.userEmail.deleteMany({ where: { userId } });

      // Saved-messages chats and any chat that has nobody left go with the
      // account; chats that still have members keep their history.
      await tx.chat.deleteMany({ where: { id: { in: chatIds }, members: { none: {} } } });

      await tx.user.update({
        where: { id: userId },
        data: {
          firstName: DELETED_ACCOUNT_NAME,
          lastName: null,
          username: null,
          bio: null,
          avatarUrl: null,
          isVerified: false,
          presence: 'OFFLINE',
          lastSeenAt: null,
          deletedAt: new Date(),
        },
      });
    });

    // Sessions are gone, so this closes every socket the account still holds.
    await this.realtime.enforceActiveSessions(userId);

    // People who shared a chat see the new, anonymised name straight away.
    const anonymised = { id: userId, firstName: DELETED_ACCOUNT_NAME, lastName: null, username: null, avatarUrl: null };
    for (const member of coMembers) {
      this.realtime.emitToUser(member.userId, RealtimeEvent.USER_PROFILE_UPDATED, anonymised);
    }

    this.logger.log(`Account ${userId} deleted (messages erased: ${Boolean(dto.deleteMessages)})`);
    return { deleted: true };
  }

  /**
   * Streams everything the account owns as one JSON document.
   *
   * It is written in pieces, with the messages read in batches, so an account
   * with a long history never has to fit in memory at once. Messages of other
   * people are not included, only what this account sent.
   */
  async exportData(userId: string, res: Response): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { emails: true, phones: true, twoFactorCredential: true },
    });

    if (!user || user.deletedAt) {
      throw new NotFoundException({ message: 'Account not found.', code: 'USER_NOT_FOUND' });
    }

    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="flux-export-${stamp}.json"`);
    res.setHeader('Cache-Control', 'no-store');

    const [privacy, contacts, blocked, memberships, sessions, bots, notifications] =
      await Promise.all([
        this.privacy.getFlags(userId),
        this.prisma.contact.findMany({
          where: { ownerId: userId },
          include: { target: { select: { id: true, username: true, firstName: true, lastName: true } } },
        }),
        this.prisma.blockedUser.findMany({ where: { ownerId: userId } }),
        this.prisma.chatMember.findMany({
          where: { userId },
          include: { chat: { select: { id: true, type: true, title: true, description: true } } },
        }),
        this.prisma.session.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } }),
        this.prisma.bot.findMany({
          where: { ownerId: userId },
          select: { id: true, name: true, username: true, description: true, isActive: true, createdAt: true },
        }),
        this.prisma.notificationSettings.findUnique({ where: { userId } }),
      ]);

    const part = (key: string, value: unknown) => `${JSON.stringify(key)}:${JSON.stringify(value)}`;

    res.write('{');
    res.write(
      [
        part('exportedAt', new Date().toISOString()),
        part(
          'note',
          'Messages of secret chats are listed as stored: end-to-end encrypted, readable only on your devices.',
        ),
        part('profile', {
          id: user.id,
          username: user.username,
          firstName: user.firstName,
          lastName: user.lastName,
          bio: user.bio,
          avatarUrl: user.avatarUrl,
          role: user.role,
          createdAt: user.createdAt,
          emails: user.emails.map((item) => ({ email: item.email, isPrimary: item.isPrimary, isVerified: item.isVerified })),
          phones: user.phones.map((item) => ({ phone: item.phone, isPrimary: item.isPrimary, isVerified: item.isVerified })),
          twoFactorEnabled: Boolean(user.twoFactorCredential?.isEnabled),
        }),
        part('privacy', privacy),
        part('notificationSettings', notifications),
        part(
          'contacts',
          contacts.map((contact) => ({
            nickname: contact.nickname,
            isFavorite: contact.isFavorite,
            isBlocked: contact.isBlocked,
            createdAt: contact.createdAt,
            user: contact.target,
          })),
        ),
        part('blockedUserIds', blocked.map((item) => item.targetId)),
        part(
          'chats',
          memberships.map((membership) => ({
            chatId: membership.chatId,
            type: membership.chat.type,
            title: membership.chat.title,
            description: membership.chat.description,
            role: membership.role,
            joinedAt: membership.joinedAt,
            isMuted: membership.isMuted,
          })),
        ),
        part(
          'sessions',
          sessions.map((session) => ({
            userAgent: session.userAgent,
            ip: session.ip,
            isActive: session.isActive,
            createdAt: session.createdAt,
            lastActiveAt: session.lastActiveAt,
          })),
        ),
        part('bots', bots),
      ].join(','),
    );

    res.write(',"messages":[');

    let cursor: string | undefined;
    let first = true;
    for (;;) {
      const batch = await this.prisma.message.findMany({
        where: { senderId: userId },
        orderBy: { id: 'asc' },
        take: EXPORT_BATCH_SIZE,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        include: {
          media: { select: { mimeType: true, size: true, duration: true, fileName: true } },
        },
      });

      if (batch.length === 0) break;

      for (const message of batch) {
        res.write(
          `${first ? '' : ','}${JSON.stringify({
            id: message.id,
            chatId: message.chatId,
            type: message.type,
            content: message.content,
            entities: message.entities,
            replyToMessageId: message.replyToMessageId,
            isEdited: message.isEdited,
            isDeleted: message.isDeleted,
            createdAt: message.createdAt,
            media: message.media,
          })}`,
        );
        first = false;
      }

      cursor = batch[batch.length - 1].id;
      if (batch.length < EXPORT_BATCH_SIZE) break;
    }

    res.write(']}');
    res.end();
  }
}
