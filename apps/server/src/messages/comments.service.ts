import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ChatMemberRole, ChatType, RealtimeEvent } from '@FLUX/shared';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { PUBLIC_USER_SELECT, projectUser } from '../privacy/public-user';

export class CreateCommentDto {
  @IsString() @MinLength(1) @MaxLength(2000)
  content!: string;
}

export class CommentsQueryDto {
  @IsOptional() @IsString() cursor?: string;
}

const PAGE = 50;

@Injectable()
export class CommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
  ) {}

  /** The post must be a live message of a channel with comments on, and the viewer a member of it. */
  private async open(userId: string, chatId: string, messageId: string) {
    const member = await this.prisma.chatMember.findFirst({ where: { chatId, userId } });
    if (!member) throw new ForbiddenException('Not a member of this chat');
    const post = await this.prisma.message.findFirst({
      where: { id: messageId, chatId, isDeleted: false },
      include: { chat: { select: { type: true, commentsEnabled: true } } },
    });
    if (!post) throw new NotFoundException('Post not found');
    if (post.chat.type !== ChatType.CHANNEL || !post.chat.commentsEnabled) {
      throw new BadRequestException({ message: 'Comments are off.', code: 'COMMENTS_DISABLED' });
    }
    return { member, post };
  }

  async list(userId: string, chatId: string, messageId: string, cursor?: string) {
    await this.open(userId, chatId, messageId);
    const rows = await this.prisma.postComment.findMany({
      where: { messageId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: PAGE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    return { items: await this.withAuthors(rows, userId), nextCursor: rows.length === PAGE ? rows[rows.length - 1].id : null };
  }

  async create(userId: string, chatId: string, messageId: string, content: string) {
    const { member } = await this.open(userId, chatId, messageId);
    if (member.role === ChatMemberRole.RESTRICTED) {
      throw new ForbiddenException({ message: 'You are not allowed to comment.', code: 'MEMBER_RESTRICTED' });
    }
    const text = content.trim();
    if (!text) throw new BadRequestException('Comment is empty');
    const row = await this.prisma.postComment.create({ data: { messageId, authorId: userId, content: text } });
    await this.broadcastCount(chatId, messageId);
    return (await this.withAuthors([row], userId))[0];
  }

  async remove(userId: string, chatId: string, messageId: string, commentId: string) {
    const { member } = await this.open(userId, chatId, messageId);
    const comment = await this.prisma.postComment.findFirst({ where: { id: commentId, messageId } });
    if (!comment) throw new NotFoundException('Comment not found');
    const isAdmin = member.role === ChatMemberRole.OWNER || member.role === ChatMemberRole.ADMIN;
    if (comment.authorId !== userId && !isAdmin) throw new ForbiddenException('Not your comment');
    await this.prisma.postComment.delete({ where: { id: commentId } });
    await this.broadcastCount(chatId, messageId);
    return { deleted: true };
  }

  private async withAuthors<T extends { authorId: string }>(rows: T[], viewerId: string) {
    const users = await this.prisma.user.findMany({
      where: { id: { in: [...new Set(rows.map((r) => r.authorId))] } },
      select: PUBLIC_USER_SELECT,
    });
    const byId = new Map(users.map((u) => [u.id, projectUser(u as any, viewerId)]));
    return rows.map((r) => ({ ...r, author: byId.get(r.authorId) ?? null }));
  }

  private async broadcastCount(chatId: string, messageId: string) {
    const commentsCount = await this.prisma.postComment.count({ where: { messageId } });
    const members = await this.prisma.chatMember.findMany({ where: { chatId }, select: { userId: true } });
    for (const m of members) {
      this.realtime.emitToUser(m.userId, RealtimeEvent.MESSAGE_UPDATED, { chatId, messageId, commentsCount });
    }
  }

  /** Adds `commentsCount` to projected channel posts. */
  async attach<T extends { id: string }>(items: T[]): Promise<(T & { commentsCount?: number })[]> {
    if (items.length === 0) return items;
    const groups = await this.prisma.postComment.groupBy({
      by: ['messageId'],
      where: { messageId: { in: items.map((i) => i.id) } },
      _count: { _all: true },
    });
    if (groups.length === 0) return items;
    const byId = new Map(groups.map((g) => [g.messageId, g._count._all]));
    return items.map((i) => (byId.has(i.id) ? { ...i, commentsCount: byId.get(i.id) } : i));
  }
}
