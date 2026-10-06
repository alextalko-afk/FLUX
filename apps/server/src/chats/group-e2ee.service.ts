import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ChatMemberRole } from '@FLUX/shared';
import { PrismaService } from '../prisma/prisma.service';

export interface ShareInput {
  userId: string;
  deviceKeyId: string;
  sealed: string;
}

const SEALED = /^[A-Za-z0-9+/=_-]{60,400}$/;

/**
 * Key distribution for end-to-end encrypted groups. The group key is generated on an
 * administrator's device and sealed to each member's device public key; the server only
 * stores the sealed boxes. Rotating to a new `epoch` (after someone left) makes the
 * old key useless for everything sent afterwards.
 */
@Injectable()
export class GroupE2eeService {
  constructor(private readonly prisma: PrismaService) {}

  private async requireGroup(userId: string, chatId: string) {
    const member = await this.prisma.chatMember.findFirst({
      where: { chatId, userId },
      include: { chat: { select: { e2ee: true, keyEpoch: true } } },
    });
    if (!member) throw new NotFoundException('Chat not found or access denied');
    if (!member.chat.e2ee) {
      throw new BadRequestException({ message: 'This group is not end-to-end encrypted.', code: 'NOT_E2EE' });
    }
    return member;
  }

  /** The newest usable device key of each member (absent when somebody has none yet). */
  private async latestKeys(userIds: string[]) {
    const keys = await this.prisma.deviceKey.findMany({
      where: { userId: { in: userIds }, revokedAt: null },
      orderBy: { lastSeenAt: 'desc' },
    });
    const byUser = new Map<string, (typeof keys)[number]>();
    for (const key of keys) if (!byUser.has(key.userId)) byUser.set(key.userId, key);
    return byUser;
  }

  async info(userId: string, chatId: string) {
    const me = await this.requireGroup(userId, chatId);
    const epoch = me.chat.keyEpoch;
    const members = await this.prisma.chatMember.findMany({ where: { chatId }, select: { userId: true, role: true } });
    const ids = members.map((m) => m.userId);
    const keys = await this.latestKeys(ids);
    const shares = await this.prisma.groupKeyShare.findMany({ where: { chatId, userId: { in: ids } } });
    const mine = shares.filter((s) => s.userId === userId).sort((a, b) => b.epoch - a.epoch);
    const covered = new Set(shares.filter((s) => s.epoch === epoch).map((s) => `${s.userId}:${s.deviceKeyId}`));
    const myKey = keys.get(userId);
    // Somebody who left still holds the current key: the next admin to open the chat rotates it.
    const strangers = await this.prisma.groupKeyShare.count({ where: { chatId, epoch, userId: { notIn: ids } } });

    return {
      chatId,
      epoch,
      rotationNeeded: strangers > 0,
      canDistribute: me.role === ChatMemberRole.OWNER || me.role === ChatMemberRole.ADMIN,
      myDevice: myKey ? { id: myKey.id, publicKey: myKey.publicKey } : null,
      // Every share I can open, newest first: older epochs keep earlier messages readable.
      myShares: mine.map((s) => ({ epoch: s.epoch, deviceKeyId: s.deviceKeyId, sealed: s.sealed })),
      members: members.map((m) => {
        const key = keys.get(m.userId);
        return {
          userId: m.userId,
          deviceKeyId: key?.id ?? null,
          publicKey: key?.publicKey ?? null,
          hasShare: key ? covered.has(`${m.userId}:${key.id}`) : false,
        };
      }),
    };
  }

  /**
   * Stores sealed keys. `epoch === current` adds shares for members that lack one;
   * `epoch === current + 1` rotates the key and must cover every member that has a device key.
   */
  async putShares(userId: string, chatId: string, epoch: number, shares: ShareInput[]) {
    const me = await this.requireGroup(userId, chatId);
    if (me.role !== ChatMemberRole.OWNER && me.role !== ChatMemberRole.ADMIN) {
      throw new ForbiddenException('Only administrators can distribute the group key');
    }
    const current = me.chat.keyEpoch;
    if (epoch !== current && epoch !== current + 1) {
      throw new ConflictException({ message: 'The key epoch is out of date.', code: 'E2EE_EPOCH_CONFLICT' });
    }

    const members = await this.prisma.chatMember.findMany({ where: { chatId }, select: { userId: true } });
    const memberIds = new Set(members.map((m) => m.userId));
    const keys = await this.latestKeys([...memberIds]);

    for (const share of shares) {
      if (!memberIds.has(share.userId)) throw new BadRequestException('Share for a non-member');
      if (keys.get(share.userId)?.id !== share.deviceKeyId) {
        throw new BadRequestException({ message: 'Share is not sealed to the current device key.', code: 'E2EE_DEVICE_STALE' });
      }
      if (!SEALED.test(share.sealed)) throw new BadRequestException('Malformed sealed key');
    }
    if (epoch === current + 1) {
      const covered = new Set(shares.map((s) => s.userId));
      const missing = [...keys.keys()].filter((id) => memberIds.has(id) && !covered.has(id));
      if (missing.length > 0) {
        throw new BadRequestException({ message: 'A rotation must cover every member with a device key.', code: 'E2EE_ROTATION_INCOMPLETE' });
      }
    }

    await this.prisma.$transaction(async (tx) => {
      if (epoch === current + 1) {
        const moved = await tx.chat.updateMany({ where: { id: chatId, keyEpoch: current }, data: { keyEpoch: epoch } });
        if (moved.count === 0) {
          throw new ConflictException({ message: 'The key epoch is out of date.', code: 'E2EE_EPOCH_CONFLICT' });
        }
      }
      for (const share of shares) {
        await tx.groupKeyShare.upsert({
          where: { chatId_epoch_userId: { chatId, epoch, userId: share.userId } },
          create: { chatId, epoch, userId: share.userId, deviceKeyId: share.deviceKeyId, sealed: share.sealed },
          update: { deviceKeyId: share.deviceKeyId, sealed: share.sealed },
        });
      }
    });
    return { epoch, stored: shares.length };
  }
}
