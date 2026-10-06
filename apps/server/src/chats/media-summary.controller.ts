import { BadRequestException, Controller, ForbiddenException, Get, NotFoundException, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsISO8601, IsOptional, Max, Min } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';

const KINDS = ['images', 'videos', 'files', 'voice', 'links'] as const;
type Kind = (typeof KINDS)[number];

/** Where-clause (on Message) that selects one kind of shared content. */
const KIND_WHERE: Record<Kind, object> = {
  images: { type: 'IMAGE' },
  videos: { type: { in: ['VIDEO', 'VIDEO_NOTE'] } },
  files: { type: { in: ['DOCUMENT', 'AUDIO'] } },
  voice: { type: 'VOICE' },
  links: { type: 'TEXT', content: { contains: 'http', mode: 'insensitive' } },
};

class MediaListQuery {
  @IsIn(KINDS as unknown as string[])
  kind!: Kind;

  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  @Max(60)
  limit?: number;

  /** Only items older than this moment (cursor). */
  @IsOptional()
  @IsISO8601()
  before?: string;
}

/** Counts and pages of the photos, videos, files, voice notes and links a member can see in a chat. */
@Controller('chats/:id')
@UseGuards(JwtAuthGuard)
export class MediaSummaryController {
  constructor(private readonly prisma: PrismaService) {}

  private async scope(userId: string, chatId: string) {
    const member = await this.prisma.chatMember.findFirst({
      where: { chatId, userId },
      include: { chat: { select: { type: true, e2ee: true } } },
    });
    if (!member) throw new ForbiddenException('Not a member of this chat');
    // Encrypted chats hold ciphertext only: there is nothing the server could list.
    const opaque = member.chat.type === 'SECRET' || member.chat.e2ee;
    return { base: { chatId, isDeleted: false, createdAt: { gte: member.joinedAt } }, opaque };
  }

  @Get('media-summary')
  async summary(@CurrentUser('id') userId: string, @Param('id', ParseUUIDPipe) chatId: string) {
    const { base, opaque } = await this.scope(userId, chatId);
    if (opaque) return { images: 0, videos: 0, files: 0, voice: 0, links: 0 };
    const counts = await Promise.all(KINDS.map((kind) => this.prisma.message.count({ where: { ...base, ...KIND_WHERE[kind] } })));
    return Object.fromEntries(KINDS.map((kind, i) => [kind, counts[i]]));
  }

  @Get('media')
  async list(@CurrentUser('id') userId: string, @Param('id', ParseUUIDPipe) chatId: string, @Query() query: MediaListQuery) {
    const { base, opaque } = await this.scope(userId, chatId);
    if (opaque) return { items: [], next: null };
    const take = query.limit ?? 30;
    const where: Record<string, unknown> = { ...base, ...KIND_WHERE[query.kind] };
    if (query.before) {
      const before = new Date(query.before);
      if (Number.isNaN(before.getTime())) throw new BadRequestException('Bad cursor');
      where.createdAt = { ...(base.createdAt as object), lt: before };
    }
    const rows = await this.prisma.message.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: take + 1,
      select: {
        id: true,
        type: true,
        content: true,
        createdAt: true,
        sender: { select: { id: true, firstName: true, lastName: true } },
        media: { select: { mimeType: true, size: true, url: true } },
      },
    });
    if (rows.length === 0 && !(await this.prisma.chat.findUnique({ where: { id: chatId } }))) throw new NotFoundException();
    const page = rows.slice(0, take);
    return { items: page, next: rows.length > take ? page[page.length - 1]!.createdAt : null };
  }
}
