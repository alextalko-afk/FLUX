import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ChatMemberRole, ChatType, MessageStatus, RealtimeEvent } from '@FLUX/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { PUBLIC_USER_SELECT, projectMessage } from '../privacy/public-user';
import { CreatePollDto } from './dto/polls.dto';

const POLL_INCLUDE = {
  options: { orderBy: { position: 'asc' as const }, include: { votes: { select: { userId: true } } } },
  message: { select: { chatId: true, senderId: true, isDeleted: true } },
};

type PollRow = NonNullable<Awaited<ReturnType<PollsService['loadRow']>>>;

@Injectable()
export class PollsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
  ) {}

  private loadRow(pollId: string) {
    return this.prisma.poll.findUnique({ where: { id: pollId }, include: POLL_INCLUDE });
  }

  private isClosed(p: { closedAt: Date | null; closesAt: Date | null }) {
    return Boolean(p.closedAt) || Boolean(p.closesAt && p.closesAt.getTime() <= Date.now());
  }

  /** Per-viewer projection: the quiz answer stays hidden until the viewer voted or the poll closed. */
  view(p: PollRow, userId: string) {
    const closed = this.isClosed(p);
    const myOptionIds = p.options.filter((o) => o.votes.some((v) => v.userId === userId)).map((o) => o.id);
    const reveal = closed || myOptionIds.length > 0;
    const voters = new Set(p.options.flatMap((o) => o.votes.map((v) => v.userId)));
    return {
      id: p.id,
      messageId: p.messageId,
      question: p.question,
      isAnonymous: p.isAnonymous,
      multiple: p.multiple,
      isQuiz: p.isQuiz,
      isClosed: closed,
      closesAt: p.closesAt,
      totalVoters: voters.size,
      myOptionIds,
      correctOptionId: p.isQuiz && reveal ? p.correctOptionId : null,
      explanation: p.isQuiz && reveal ? p.explanation : null,
      options: p.options.map((o) => ({ id: o.id, text: o.text, votes: o.votes.length })),
    };
  }

  /** Adds `poll` to projected POLL messages (history, pins, search). */
  async attach<T extends { id: string; type: string }>(items: T[], userId: string): Promise<(T & { poll?: unknown })[]> {
    const ids = items.filter((i) => i.type === 'POLL').map((i) => i.id);
    if (ids.length === 0) return items;
    const rows = await this.prisma.poll.findMany({ where: { messageId: { in: ids } }, include: POLL_INCLUDE });
    const byMsg = new Map(rows.map((r) => [r.messageId, this.view(r as PollRow, userId)]));
    return items.map((i) => (byMsg.has(i.id) ? { ...i, poll: byMsg.get(i.id) } : i));
  }

  private async broadcast(row: PollRow) {
    const members = await this.prisma.chatMember.findMany({ where: { chatId: row.message.chatId }, select: { userId: true } });
    for (const m of members) {
      this.realtime.emitToUser(m.userId, RealtimeEvent.MESSAGE_UPDATED, {
        chatId: row.message.chatId,
        messageId: row.messageId,
        poll: this.view(row, m.userId),
      });
    }
  }

  async create(userId: string, chatId: string, dto: CreatePollDto) {
    const chat = await this.prisma.chat.findUnique({ where: { id: chatId }, select: { type: true, e2ee: true } });
    if (!chat) throw new NotFoundException('Chat not found');
    if (chat.type === ChatType.SECRET || chat.e2ee) {
      throw new BadRequestException({ message: 'Polls are not available in secret chats.', code: 'POLL_SECRET_CHAT' });
    }
    const texts = dto.options.map((o) => o.trim());
    if (texts.some((t) => !t) || new Set(texts.map((t) => t.toLowerCase())).size !== texts.length) {
      throw new BadRequestException({ message: 'Options must be non-empty and unique.', code: 'POLL_BAD_OPTIONS' });
    }
    if (dto.isQuiz) {
      if (dto.correctOption === undefined || dto.correctOption >= texts.length) {
        throw new BadRequestException({ message: 'A quiz needs a valid correct option.', code: 'POLL_BAD_CORRECT' });
      }
      if (dto.multiple) throw new BadRequestException({ message: 'A quiz allows one answer.', code: 'POLL_QUIZ_MULTIPLE' });
    }
    const closesAt = dto.closesAt ? new Date(dto.closesAt) : null;
    if (closesAt && closesAt.getTime() < Date.now() + 10_000) {
      throw new BadRequestException({ message: 'closesAt must be in the future.', code: 'POLL_BAD_CLOSE' });
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const message = await tx.message.create({
        data: {
          chatId,
          senderId: userId,
          type: 'POLL',
          content: dto.question.trim(),
          status: MessageStatus.SENT,
          poll: {
            create: {
              question: dto.question.trim(),
              isAnonymous: dto.isAnonymous ?? true,
              multiple: dto.multiple ?? false,
              isQuiz: dto.isQuiz ?? false,
              explanation: dto.isQuiz ? dto.explanation?.trim() || null : null,
              closesAt,
              options: { create: texts.map((text, position) => ({ text, position })) },
            },
          },
        },
        include: {
          sender: { select: PUBLIC_USER_SELECT },
          media: true,
          poll: { include: { options: { orderBy: { position: 'asc' } } } },
        },
      });
      if (dto.isQuiz) {
        await tx.poll.update({
          where: { id: message.poll!.id },
          data: { correctOptionId: message.poll!.options[dto.correctOption!].id },
        });
      }
      await tx.chat.update({ where: { id: chatId }, data: { updatedAt: new Date() } });
      return message;
    });

    const row = (await this.loadRow(created.poll!.id)) as PollRow;
    const members = await this.prisma.chatMember.findMany({ where: { chatId }, select: { userId: true } });
    for (const m of members) {
      this.realtime.emitToUser(m.userId, RealtimeEvent.MESSAGE_NEW, {
        chatId,
        message: { ...projectMessage(created as any, m.userId), poll: this.view(row, m.userId) },
        isSelf: m.userId === userId,
      });
    }
    return { ...projectMessage(created as any, userId), poll: this.view(row, userId) };
  }

  private async open(userId: string, pollId: string) {
    const row = await this.loadRow(pollId);
    if (!row || row.message.isDeleted) throw new NotFoundException('Poll not found');
    const member = await this.prisma.chatMember.findFirst({ where: { chatId: row.message.chatId, userId } });
    if (!member) throw new ForbiddenException('Not a member of this chat');
    return { row, member };
  }

  private assertOpen(row: PollRow) {
    if (this.isClosed(row)) throw new ConflictException({ message: 'Poll is closed.', code: 'POLL_CLOSED' });
  }

  async vote(userId: string, pollId: string, optionIds: string[]) {
    const { row } = await this.open(userId, pollId);
    this.assertOpen(row);
    const unique = [...new Set(optionIds)];
    const valid = new Set(row.options.map((o) => o.id));
    if (unique.some((id) => !valid.has(id))) {
      throw new BadRequestException({ message: 'Unknown option.', code: 'POLL_BAD_OPTION' });
    }
    if (!row.multiple && unique.length !== 1) {
      throw new BadRequestException({ message: 'Only one option allowed.', code: 'POLL_SINGLE_CHOICE' });
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${pollId + ':' + userId}))`;
      if (row.isQuiz && (await tx.pollVote.count({ where: { pollId, userId } })) > 0) {
        throw new ConflictException({ message: 'Quiz answers are final.', code: 'POLL_QUIZ_FINAL' });
      }
      await tx.pollVote.deleteMany({ where: { pollId, userId } });
      await tx.pollVote.createMany({ data: unique.map((optionId) => ({ pollId, optionId, userId })) });
    });
    const fresh = (await this.loadRow(pollId)) as PollRow;
    await this.broadcast(fresh);
    return this.view(fresh, userId);
  }

  async retract(userId: string, pollId: string) {
    const { row } = await this.open(userId, pollId);
    this.assertOpen(row);
    if (row.isQuiz) throw new ConflictException({ message: 'Quiz answers are final.', code: 'POLL_QUIZ_FINAL' });
    await this.prisma.pollVote.deleteMany({ where: { pollId, userId } });
    const fresh = (await this.loadRow(pollId)) as PollRow;
    await this.broadcast(fresh);
    return this.view(fresh, userId);
  }

  async close(userId: string, pollId: string) {
    const { row, member } = await this.open(userId, pollId);
    const isAdmin = member.role === ChatMemberRole.OWNER || member.role === ChatMemberRole.ADMIN;
    if (row.message.senderId !== userId && !isAdmin) {
      throw new ForbiddenException('Only the author or an admin can close a poll');
    }
    if (!row.closedAt) await this.prisma.poll.update({ where: { id: pollId }, data: { closedAt: new Date() } });
    const fresh = (await this.loadRow(pollId)) as PollRow;
    await this.broadcast(fresh);
    return this.view(fresh, userId);
  }

  async voters(userId: string, pollId: string) {
    const { row } = await this.open(userId, pollId);
    if (row.isAnonymous) throw new ForbiddenException({ message: 'Anonymous poll.', code: 'POLL_ANONYMOUS' });
    const votes = await this.prisma.pollVote.findMany({ where: { pollId } });
    const users = await this.prisma.user.findMany({
      where: { id: { in: [...new Set(votes.map((v) => v.userId))] } },
      select: PUBLIC_USER_SELECT,
    });
    const byId = new Map(users.map((u) => [u.id, u]));
    return {
      options: row.options.map((o) => ({
        id: o.id,
        voters: votes.filter((v) => v.optionId === o.id).map((v) => byId.get(v.userId)).filter(Boolean),
      })),
    };
  }
}
