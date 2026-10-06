import { RealtimeGateway } from '../realtime/realtime.gateway';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { AuditService } from '../audit/audit.service';
import { PasswordService } from '../auth/password.service';
import {
  AdminUserActionDto,
  AdminChatActionDto,
  AdminMessageActionDto,
  AdminResolveReportDto,
  AdminListQueryDto,
} from './dto/admin.dto';
import { UserRole } from '@FLUX/shared';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly audit: AuditService,
    private readonly passwordService: PasswordService,
    private readonly realtime: RealtimeGateway,
  ) {}

  private async requireAdmin(adminId: string) {
    const admin = await this.prisma.user.findUnique({ where: { id: adminId } });
    if (!admin || admin.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Admin access required');
    }
    return admin;
  }

  async getDashboard() {
    const [
      totalUsers,
      activeUsers,
      totalChats,
      totalMessages,
      totalFiles,
      pendingReports,
      totalBots,
      totalCalls,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({
        where: {
          lastSeenAt: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
          },
        },
      }),
      this.prisma.chat.count(),
      this.prisma.message.count(),
      this.prisma.fileObject.count(),
      this.prisma.report.count({ where: { status: 'PENDING' } }),
      this.prisma.bot.count(),
      this.prisma.call.count(),
    ]);

    const messagesLast7Days: { date: string; count: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setUTCHours(0, 0, 0, 0);
      date.setUTCDate(date.getUTCDate() - i);
      const next = new Date(date);
      next.setUTCDate(next.getUTCDate() + 1);

      const count = await this.prisma.message.count({
        where: {
          createdAt: { gte: date, lt: next },
        },
      });

      messagesLast7Days.push({
        date: date.toISOString().slice(0, 10),
        count,
      });
    }

    return {
      users: { total: totalUsers, active24h: activeUsers },
      chats: totalChats,
      messages: { total: totalMessages, last7Days: messagesLast7Days },
      files: totalFiles,
      reports: { pending: pendingReports },
      bots: totalBots,
      calls: totalCalls,
    };
  }

  async listUsers(query: AdminListQueryDto) {
    const take = query.limit ?? 50;
    const where: any = {};
    if (query.q) {
      where.OR = [
        { username: { contains: query.q, mode: 'insensitive' } },
        { firstName: { contains: query.q, mode: 'insensitive' } },
        { lastName: { contains: query.q, mode: 'insensitive' } },
        { emails: { some: { email: { contains: query.q, mode: 'insensitive' } } } },
      ];
    }

    const users = await this.prisma.user.findMany({
      where,
      take,
      cursor: query.cursor ? { id: query.cursor } : undefined,
      skip: query.cursor ? 1 : 0,
      orderBy: { createdAt: 'desc' },
      include: {
        emails: { take: 1 },
        _count: {
          select: {
            chatMembers: true,
            sentMessages: true,
            reports: true,
          },
        },
      },
    });

    return {
      items: users,
      nextCursor: users.length === take ? users[users.length - 1]?.id || null : null,
    };
  }

  async performUserAction(adminId: string, dto: AdminUserActionDto) {
    await this.requireAdmin(adminId);

    const target = await this.prisma.user.findUnique({ where: { id: dto.userId } });
    if (!target) throw new NotFoundException('User not found');

    if (target.role === UserRole.ADMIN && dto.action !== 'UNBAN') {
      throw new ForbiddenException('Cannot modify another admin');
    }

    switch (dto.action) {
      case 'BAN':
        await this.prisma.user.update({
          where: { id: dto.userId },
          data: { isBlocked: true },
        });
        await this.prisma.session.updateMany({
          where: { userId: dto.userId },
          data: { isActive: false },
        });
        break;

      case 'UNBAN':
        await this.prisma.user.update({
          where: { id: dto.userId },
          data: { isBlocked: false },
        });
        break;

      case 'RESET_PASSWORD':
        if (!dto.newPassword) {
          throw new BadRequestException('New password required');
        }
        const hash = await this.passwordService.hash(dto.newPassword);
        await this.prisma.passwordCredential.update({
          where: { userId: dto.userId },
          data: { hash },
        });
        await this.prisma.refreshToken.updateMany({
          where: { userId: dto.userId },
          data: { isRevoked: true },
        });
        await this.prisma.session.updateMany({
          where: { userId: dto.userId },
          data: { isActive: false },
        });
        break;

      case 'REVOKE_SESSIONS':
        await this.prisma.session.updateMany({
          where: { userId: dto.userId },
          data: { isActive: false },
        });
        await this.prisma.refreshToken.updateMany({
          where: { userId: dto.userId },
          data: { isRevoked: true },
        });
        break;

      case 'DELETE':
        await this.prisma.user.delete({ where: { id: dto.userId } });
        break;

      case 'VERIFY':
        await this.prisma.user.update({
          where: { id: dto.userId },
          data: { isVerified: true },
        });
        break;

      case 'SET_ROLE':
        if (!dto.role) throw new BadRequestException('Role required');
        await this.prisma.user.update({
          where: { id: dto.userId },
          data: { role: dto.role as UserRole },
        });
        break;
    }

    // Ending sessions must also cut the sockets those sessions still hold open.
    if (['BAN', 'RESET_PASSWORD', 'REVOKE_SESSIONS'].includes(dto.action)) {
      await this.realtime.enforceActiveSessions(dto.userId);
    }

    await this.audit.log(adminId, dto.action, dto.userId, {
      reason: dto.reason,
      targetUsername: target.username,
    });

    return { success: true };
  }

  async performChatAction(adminId: string, dto: AdminChatActionDto) {
    await this.requireAdmin(adminId);

    const chat = await this.prisma.chat.findUnique({ where: { id: dto.chatId } });
    if (!chat) throw new NotFoundException('Chat not found');

    switch (dto.action) {
      case 'DELETE':
        await this.prisma.chat.delete({ where: { id: dto.chatId } });
        break;
      case 'ARCHIVE':
        await this.prisma.chat.update({
          where: { id: dto.chatId },
          data: { isArchived: true },
        });
        break;
      case 'UNARCHIVE':
        await this.prisma.chat.update({
          where: { id: dto.chatId },
          data: { isArchived: false },
        });
        break;
    }

    await this.audit.log(adminId, `CHAT_${dto.action}`, dto.chatId, {
      reason: dto.reason,
      chatTitle: chat.title,
    });

    return { success: true };
  }

  /**
   * Paginated chat listing for the admin panel.
   *
   * Mirrors the shape of {@link listUsers} so the admin UI can reuse the same
   * cursor-based table logic.
   */
  async listChats(query: AdminListQueryDto) {
    const take = query.limit ?? 50;
    const where: any = {};
    if (query.q) {
      where.OR = [
        { title: { contains: query.q, mode: 'insensitive' } },
        { description: { contains: query.q, mode: 'insensitive' } },
      ];
    }

    const chats = await this.prisma.chat.findMany({
      where,
      take,
      cursor: query.cursor ? { id: query.cursor } : undefined,
      skip: query.cursor ? 1 : 0,
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { members: true, messages: true, reports: true },
        },
      },
    });

    return {
      items: chats,
      nextCursor: chats.length === take ? chats[chats.length - 1]?.id || null : null,
    };
  }

  async performMessageAction(adminId: string, dto: AdminMessageActionDto) {
    await this.requireAdmin(adminId);

    const message = await this.prisma.message.findUnique({
      where: { id: dto.messageId },
    });
    if (!message) throw new NotFoundException('Message not found');

    await this.prisma.message.update({
      where: { id: dto.messageId },
      data: { isDeleted: true, content: '' },
    });

    await this.audit.log(adminId, 'MESSAGE_DELETE', dto.messageId, {
      reason: dto.reason,
      chatId: message.chatId,
      senderId: message.senderId,
    });

    return { success: true };
  }

  async listReports(query: AdminListQueryDto) {
    const take = query.limit ?? 50;
    const reports = await this.prisma.report.findMany({
      take,
      cursor: query.cursor ? { id: query.cursor } : undefined,
      skip: query.cursor ? 1 : 0,
      orderBy: { createdAt: 'desc' },
      include: {
        reporter: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    return {
      items: reports,
      nextCursor: reports.length === take ? reports[reports.length - 1]?.id || null : null,
    };
  }

  async resolveReport(adminId: string, dto: AdminResolveReportDto) {
    await this.requireAdmin(adminId);

    const report = await this.prisma.report.findUnique({ where: { id: dto.reportId } });
    if (!report) throw new NotFoundException('Report not found');

    await this.prisma.report.update({
      where: { id: dto.reportId },
      data: { status: dto.status },
    });

    await this.audit.log(adminId, 'REPORT_RESOLVE', dto.reportId, {
      status: dto.status,
      note: dto.note,
    });

    return { success: true };
  }

  async listAuditLogs(adminId: string, query: AdminListQueryDto) {
    await this.requireAdmin(adminId);
    return this.audit.list(query.limit ?? 100, query.cursor);
  }

  async listSessions(adminId: string, userId: string) {
    await this.requireAdmin(adminId);
    const sessions = await this.prisma.session.findMany({
      where: { userId },
      orderBy: { lastActiveAt: 'desc' },
      include: { deviceInfo: true },
    });
    return { items: sessions };
  }
}
