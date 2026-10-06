import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async log(
    adminId: string,
    action: string,
    target?: string,
    details?: Record<string, any>,
  ): Promise<void> {
    try {
      await this.prisma.adminActionLog.create({
        data: {
          adminId,
          action,
          target,
          details: details ?? undefined,
        },
      });
    } catch (err) {
      this.logger.error(`Failed to write audit log: ${err}`);
    }
  }

  async list(limit = 100, cursor?: string) {
    const take = Math.min(limit, 200);
    const items = await this.prisma.adminActionLog.findMany({
      take,
      cursor: cursor ? { id: cursor } : undefined,
      skip: cursor ? 1 : 0,
      orderBy: { createdAt: 'desc' },
      include: {
        admin: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
            avatarUrl: true,
          },
        },
      },
    });

    return {
      items,
      nextCursor: items.length === take ? items[items.length - 1]?.id || null : null,
    };
  }
}
