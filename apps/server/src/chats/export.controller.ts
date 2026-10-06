import { BadRequestException, Controller, ForbiddenException, Get, NotFoundException, Param, ParseUUIDPipe, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';

const MAX_MESSAGES = 20000;
const PAGE = 1000;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Downloads a member's view of a chat as JSON or as a readable HTML page. */
@Controller('chats')
@UseGuards(JwtAuthGuard)
export class ChatExportController {
  constructor(private readonly prisma: PrismaService) {}

  @Get(':id/export')
  async export(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) chatId: string,
    @Query('format') format = 'json',
    @Res() res: Response,
  ) {
    if (format !== 'json' && format !== 'html') {
      throw new BadRequestException({ message: 'format must be json or html', code: 'EXPORT_FORMAT' });
    }
    const member = await this.prisma.chatMember.findFirst({ where: { chatId, userId } });
    if (!member) throw new ForbiddenException('Not a member of this chat');
    const chat = await this.prisma.chat.findUnique({ where: { id: chatId } });
    if (!chat) throw new NotFoundException('Chat not found');
    if (chat.type === 'SECRET' || chat.e2ee) {
      throw new BadRequestException({ message: 'Secret chats cannot be exported.', code: 'EXPORT_SECRET' });
    }

    const rows: any[] = [];
    let cursor: string | undefined;
    while (rows.length < MAX_MESSAGES) {
      const page = await this.prisma.message.findMany({
        where: { chatId, isDeleted: false, createdAt: { gte: member.joinedAt } },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: PAGE,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        include: { sender: { select: { id: true, firstName: true, lastName: true, username: true } }, media: true },
      });
      rows.push(...page);
      if (page.length < PAGE) break;
      cursor = page[page.length - 1].id;
    }

    const messages = rows.map((m) => ({
      id: m.id,
      date: m.createdAt,
      from: [m.sender.firstName, m.sender.lastName].filter(Boolean).join(' '),
      fromId: m.senderId,
      type: m.type,
      text: m.content,
      edited: m.isEdited,
      replyTo: m.replyToMessageId,
      file: m.media ? { name: m.media.url.split('/').pop(), mimeType: m.media.mimeType, size: m.media.size } : undefined,
    }));
    const name = `chat-${chatId.slice(0, 8)}`;

    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${name}.json"`);
      return res.send(JSON.stringify({ chat: { id: chat.id, type: chat.type, title: chat.title }, exportedAt: new Date(), messages }, null, 2));
    }
    const body = messages
      .map(
        (m) =>
          `<div class="m"><b>${esc(m.from)}</b> <small>${m.date.toISOString()}</small><div>${esc(m.text)}${m.file ? ` <i>[${esc(m.file.name ?? 'file')}]</i>` : ''}</div></div>`,
      )
      .join('\n');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${name}.html"`);
    return res.send(
      `<!doctype html><meta charset="utf-8"><title>${esc(chat.title ?? 'Chat')}</title><style>body{font:14px system-ui;max-width:720px;margin:2em auto}.m{margin:.6em 0;padding:.5em .8em;background:#f3f4f6;border-radius:8px}small{color:#666}</style><h1>${esc(chat.title ?? 'Chat')}</h1>\n${body}`,
    );
  }
}
