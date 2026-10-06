import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PUBLIC_USER_SELECT } from '../privacy/public-user';

export type AdminAction =
  | 'chat.updated'
  | 'member.added'
  | 'member.removed'
  | 'member.role'
  | 'invite.rotated'
  | 'invite.revoked'
  | 'join.approved'
  | 'join.rejected';

/** Append-only record of what administrators did in a group or channel. */
@Injectable()
export class AdminLogService {
  private readonly logger = new Logger(AdminLogService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Never throws: a failed log line must not undo the action it describes. */
  async record(
    chatId: string,
    actorId: string,
    action: AdminAction,
    targetUserId?: string,
    details?: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.prisma.chatAdminLog.create({
        data: { chatId, actorId, action, targetUserId, details: details as any },
      });
    } catch (error) {
      this.logger.warn(`Admin log write failed: ${error}`);
    }
  }

  async list(chatId: string, limit = 50, cursor?: string) {
    const rows = await this.prisma.chatAdminLog.findMany({
      where: { chatId },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const page = rows.slice(0, limit);
    const ids = [...new Set(page.flatMap((row) => [row.actorId, row.targetUserId]).filter(Boolean))] as string[];
    const users = await this.prisma.user.findMany({ where: { id: { in: ids } }, select: PUBLIC_USER_SELECT });
    const byId = new Map(users.map((user) => [user.id, user]));
    return {
      items: page.map((row) => ({
        ...row,
        actor: byId.get(row.actorId) ?? null,
        target: row.targetUserId ? (byId.get(row.targetUserId) ?? null) : null,
      })),
      nextCursor: rows.length > limit ? page[page.length - 1].id : null,
    };
  }
}
