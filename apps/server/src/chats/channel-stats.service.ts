import { BadRequestException, Controller, ForbiddenException, Get, Injectable, NotFoundException, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { ChatMemberRole, ChatType } from '@FLUX/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';

const DAYS = 14;
const RECENT_POSTS = 30;

@Injectable()
export class ChannelStatsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Views are the read receipts of other people: one per subscriber per post. */
  async stats(userId: string, chatId: string) {
    const member = await this.prisma.chatMember.findFirst({ where: { chatId, userId } });
    if (!member) throw new ForbiddenException('Not a member of this chat');
    if (member.role !== ChatMemberRole.OWNER && member.role !== ChatMemberRole.ADMIN) {
      throw new ForbiddenException('Only admins can see statistics');
    }
    const chat = await this.prisma.chat.findUnique({ where: { id: chatId }, select: { type: true } });
    if (!chat) throw new NotFoundException('Chat not found');
    if (chat.type !== ChatType.CHANNEL) throw new BadRequestException({ message: 'Not a channel.', code: 'NOT_A_CHANNEL' });

    const since = new Date();
    since.setUTCHours(0, 0, 0, 0);
    since.setUTCDate(since.getUTCDate() - (DAYS - 1));

    const [subscribers, posts, recent, joins] = await Promise.all([
      this.prisma.chatMember.count({ where: { chatId } }),
      this.prisma.message.count({ where: { chatId, isDeleted: false, type: { not: 'SYSTEM' } } }),
      this.prisma.message.findMany({
        where: { chatId, isDeleted: false, type: { not: 'SYSTEM' } },
        orderBy: { createdAt: 'desc' },
        take: RECENT_POSTS,
        select: { id: true, content: true, type: true, createdAt: true, _count: { select: { readReceipts: true, comments: true } } },
      }),
      this.prisma.chatMember.findMany({ where: { chatId, joinedAt: { gte: since } }, select: { joinedAt: true } }),
    ]);

    const perDay = new Map<string, number>();
    for (let i = 0; i < DAYS; i++) {
      const d = new Date(since);
      d.setUTCDate(since.getUTCDate() + i);
      perDay.set(d.toISOString().slice(0, 10), 0);
    }
    for (const j of joins) {
      const key = j.joinedAt.toISOString().slice(0, 10);
      perDay.set(key, (perDay.get(key) ?? 0) + 1);
    }

    const rows = recent.map((p) => ({
      id: p.id,
      type: p.type,
      preview: p.content.slice(0, 80),
      createdAt: p.createdAt,
      views: p._count.readReceipts,
      comments: p._count.comments,
    }));
    const totalViews = rows.reduce((sum, r) => sum + r.views, 0);

    return {
      subscribers,
      posts,
      avgViews: rows.length ? Math.round(totalViews / rows.length) : 0,
      joinsByDay: [...perDay].map(([date, count]) => ({ date, count })),
      topPosts: [...rows].sort((a, b) => b.views - a.views).slice(0, 5),
    };
  }
}

@Controller('chats/:chatId/stats')
@UseGuards(JwtAuthGuard)
export class ChannelStatsController {
  constructor(private readonly stats: ChannelStatsService) {}

  @Get()
  get(@CurrentUser('id') userId: string, @Param('chatId', ParseUUIDPipe) chatId: string) {
    return this.stats.stats(userId, chatId);
  }
}
