import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ChatType, MessageStatus, RealtimeEvent } from '@FLUX/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { PUBLIC_USER_SELECT, projectMessage } from '../privacy/public-user';
import { CreateStickerPackDto } from './dto/stickers.dto';

const STICKER_MIMES = new Set(['image/png', 'image/webp', 'image/gif', 'video/webm']);
const MAX_STICKER_BYTES = 512 * 1024;
const MAX_PACKS_PER_USER = 50;

const toView = (s: { id: string; packId: string; emoji: string; fileObjectId: string; mimeType?: string }) => ({
  id: s.id,
  packId: s.packId,
  emoji: s.emoji,
  mimeType: s.mimeType ?? 'image/png',
  url: `/api/v1/media/download/${s.fileObjectId}`,
});

@Injectable()
export class StickersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
  ) {}

  private packView(p: { id: string; title: string; ownerId: string; stickers: any[] }) {
    return {
      id: p.id,
      title: p.title,
      ownerId: p.ownerId,
      stickers: [...p.stickers].sort((a, b) => a.position - b.position).map(toView),
    };
  }

  async createPack(userId: string, dto: CreateStickerPackDto) {
    if ((await this.prisma.stickerPack.count({ where: { ownerId: userId } })) >= MAX_PACKS_PER_USER) {
      throw new ConflictException({ message: 'Too many sticker packs.', code: 'STICKER_PACK_LIMIT' });
    }
    const ids = dto.stickers.map((s) => s.fileObjectId);
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException({ message: 'Duplicate file.', code: 'STICKER_DUPLICATE_FILE' });
    }
    const files = await this.prisma.fileObject.findMany({ where: { id: { in: ids } } });
    if (files.length !== ids.length) throw new NotFoundException('Sticker file not found');
    for (const f of files) {
      if (f.ownerId !== userId) throw new ForbiddenException('Not your file');
      if (!STICKER_MIMES.has(f.mimeType) || f.size > MAX_STICKER_BYTES) {
        throw new BadRequestException({ message: 'Stickers must be PNG, WebP, GIF or WebM up to 512 KB.', code: 'STICKER_BAD_FILE' });
      }
    }
    const pack = await this.prisma.stickerPack.create({
      data: {
        title: dto.title.trim(),
        ownerId: userId,
        stickers: {
          create: dto.stickers.map((s, position) => ({
            emoji: s.emoji,
            fileObjectId: s.fileObjectId,
            position,
            mimeType: files.find((f) => f.id === s.fileObjectId)?.mimeType ?? 'image/png',
          })),
        },
        installs: { create: { userId } },
      },
      include: { stickers: true },
    });
    return this.packView(pack);
  }

  async getPack(id: string) {
    const pack = await this.prisma.stickerPack.findUnique({ where: { id }, include: { stickers: true } });
    if (!pack) throw new NotFoundException('Sticker pack not found');
    return this.packView(pack);
  }

  async mine(userId: string) {
    const installs = await this.prisma.stickerPackInstall.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      include: { pack: { include: { stickers: true } } },
    });
    return { items: installs.map((i) => this.packView(i.pack)) };
  }

  async search(q: string) {
    const packs = await this.prisma.stickerPack.findMany({
      where: { title: { contains: q.trim(), mode: 'insensitive' } },
      take: 20,
      include: { stickers: true },
    });
    return { items: packs.map((p) => this.packView(p)) };
  }

  async install(userId: string, packId: string) {
    await this.getPack(packId);
    await this.prisma.stickerPackInstall.upsert({
      where: { userId_packId: { userId, packId } },
      create: { userId, packId },
      update: {},
    });
    return { installed: true };
  }

  async uninstall(userId: string, packId: string) {
    await this.prisma.stickerPackInstall.deleteMany({ where: { userId, packId } });
    return { installed: false };
  }

  async deletePack(userId: string, packId: string) {
    const pack = await this.prisma.stickerPack.findUnique({ where: { id: packId } });
    if (!pack) throw new NotFoundException('Sticker pack not found');
    if (pack.ownerId !== userId) throw new ForbiddenException('Only the owner can delete a pack');
    await this.prisma.stickerPack.delete({ where: { id: packId } });
    return { deleted: true };
  }

  /** Adds `sticker` to projected STICKER messages; `content` holds the sticker id. */
  async attach<T extends { type: string; content?: string | null }>(items: T[]): Promise<(T & { sticker?: unknown })[]> {
    const ids = items.filter((i) => i.type === 'STICKER' && i.content).map((i) => i.content as string);
    if (ids.length === 0) return items;
    const rows = await this.prisma.sticker.findMany({ where: { id: { in: ids } } });
    const byId = new Map(rows.map((r) => [r.id, toView(r)]));
    return items.map((i) => (i.type === 'STICKER' && byId.has(i.content as string) ? { ...i, sticker: byId.get(i.content as string) } : i));
  }

  async send(userId: string, chatId: string, stickerId: string, replyToMessageId?: string) {
    const chat = await this.prisma.chat.findUnique({ where: { id: chatId }, select: { type: true, e2ee: true } });
    if (!chat) throw new NotFoundException('Chat not found');
    if (chat.type === ChatType.SECRET || chat.e2ee) {
      throw new BadRequestException({ message: 'Stickers are not available in secret chats.', code: 'STICKER_SECRET_CHAT' });
    }
    const sticker = await this.prisma.sticker.findUnique({ where: { id: stickerId } });
    if (!sticker) throw new NotFoundException('Sticker not found');

    const message = await this.prisma.message.create({
      data: { chatId, senderId: userId, type: 'STICKER', content: sticker.id, replyToMessageId, status: MessageStatus.SENT },
      include: { sender: { select: PUBLIC_USER_SELECT }, media: true },
    });
    await this.prisma.chat.update({ where: { id: chatId }, data: { updatedAt: new Date() } });

    const members = await this.prisma.chatMember.findMany({ where: { chatId }, select: { userId: true } });
    const view = toView(sticker);
    for (const m of members) {
      this.realtime.emitToUser(m.userId, RealtimeEvent.MESSAGE_NEW, {
        chatId,
        message: { ...projectMessage(message as any, m.userId), sticker: view },
        isSelf: m.userId === userId,
      });
    }
    return { ...projectMessage(message as any, userId), sticker: view };
  }
}
