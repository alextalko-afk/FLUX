import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdatePrivacyDto } from './dto/privacy.dto';
import {
  DEFAULT_PRIVACY_FLAGS,
  definePrivacyPatch,
  pickPrivacyFlags,
  resolveVisibility,
  type PrivacyFlags,
} from './privacy.flags';

export {
  DEFAULT_PRIVACY_FLAGS,
  PRIVACY_FLAG_KEYS,
  type PrivacyFlags,
} from './privacy.flags';

/**
 * Owns the per-account privacy switches and the read-side helpers used to
 * enforce them. It is a global provider (like PrismaService) because the flags
 * are consulted from users, contacts, presence, realtime, calls, chats and
 * messages without creating an import cycle.
 */
@Injectable()
export class PrivacyService {
  constructor(private readonly prisma: PrismaService) {}

  /** Stored flags for one account, creating the row on first access. */
  async getFlags(userId: string): Promise<PrivacyFlags> {
    const row = await this.prisma.privacySettings.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });
    return pickPrivacyFlags(row);
  }

  /**
   * Flags for many accounts in one query, keyed by user id. Accounts without a
   * stored row get the permissive defaults.
   */
  async getFlagsFor(userIds: string[]): Promise<Record<string, PrivacyFlags>> {
    const unique = Array.from(new Set(userIds));
    const map: Record<string, PrivacyFlags> = {};
    for (const id of unique) {
      map[id] = { ...DEFAULT_PRIVACY_FLAGS };
    }
    if (unique.length === 0) return map;

    const rows = await this.prisma.privacySettings.findMany({
      where: { userId: { in: unique } },
    });
    for (const row of rows) {
      map[row.userId] = pickPrivacyFlags(row);
    }
    return map;
  }

  /** Applies a partial update and returns the stored flags. */
  async updateFlags(
    userId: string,
    dto: UpdatePrivacyDto,
  ): Promise<PrivacyFlags> {
    const data = definePrivacyPatch(dto);
    const row = await this.prisma.privacySettings.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });
    return pickPrivacyFlags(row);
  }

  /** Resolves which of a target's fields `viewerId` may see. */
  visibilityFor(
    user: { id: string; privacySettings?: Partial<PrivacyFlags> | null },
    viewerId?: string,
  ): { avatarUrl: boolean; bio: boolean; online: boolean; lastSeen: boolean } {
    return resolveVisibility(user, viewerId);
  }

  /** A viewer always sees their own presence. */
  async canSeeOnline(viewerId: string, targetId: string): Promise<boolean> {
    if (viewerId === targetId) return true;
    return (await this.getFlags(targetId)).showOnlineStatus;
  }

  async allowsCalls(targetId: string): Promise<boolean> {
    return (await this.getFlags(targetId)).allowCalls;
  }

  async allowsMessages(targetId: string): Promise<boolean> {
    return (await this.getFlags(targetId)).allowMessages;
  }

  async allowsGroupInvites(targetId: string): Promise<boolean> {
    return (await this.getFlags(targetId)).allowGroupInvites;
  }

  async allowsForwarding(targetId: string): Promise<boolean> {
    return (await this.getFlags(targetId)).allowForwarding;
  }

  async showsTypingStatus(userId: string): Promise<boolean> {
    return (await this.getFlags(userId)).showTypingStatus;
  }

  async showsReadReceipts(userId: string): Promise<boolean> {
    return (await this.getFlags(userId)).showReadReceipts;
  }
}
