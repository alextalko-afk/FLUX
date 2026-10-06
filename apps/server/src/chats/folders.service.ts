import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { RealtimeEvent } from '@FLUX/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { CreateFolderDto, ReorderFoldersDto, UpdateFolderDto } from './dto/folders.dto';

export const MAX_FOLDERS = 10;
export const MAX_CHATS_PER_FOLDER = 100;

export interface FolderView {
  id: string;
  name: string;
  position: number;
  chatIds: string[];
}

/**
 * Personal chat folders. A folder only groups the owner's own view of their
 * chats: it is invisible to everybody else and does not touch the chats.
 */
@Injectable()
export class FoldersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
  ) {}

  async list(userId: string): Promise<{ items: FolderView[] }> {
    const folders = await this.prisma.chatFolder.findMany({
      where: { userId },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      include: { assignments: { select: { chatId: true } } },
    });

    return {
      items: folders.map((folder) => ({
        id: folder.id,
        name: folder.name,
        position: folder.position,
        chatIds: folder.assignments.map((assignment) => assignment.chatId),
      })),
    };
  }

  async create(userId: string, dto: CreateFolderDto): Promise<FolderView> {
    const count = await this.prisma.chatFolder.count({ where: { userId } });
    if (count >= MAX_FOLDERS) {
      throw new BadRequestException({
        message: `You can have at most ${MAX_FOLDERS} folders.`,
        code: 'FOLDER_LIMIT_REACHED',
      });
    }

    const chatIds = await this.ownChatIds(userId, dto.chatIds);

    const folder = await this.prisma.chatFolder.create({
      data: {
        userId,
        name: dto.name,
        position: count,
        assignments: { create: chatIds.map((chatId) => ({ chatId })) },
      },
    });

    await this.publish(userId);
    return { id: folder.id, name: folder.name, position: folder.position, chatIds };
  }

  async update(userId: string, folderId: string, dto: UpdateFolderDto): Promise<FolderView> {
    const folder = await this.requireFolder(userId, folderId);
    const chatIds = dto.chatIds ? await this.ownChatIds(userId, dto.chatIds) : undefined;

    await this.prisma.$transaction(async (tx) => {
      if (dto.name !== undefined) {
        await tx.chatFolder.update({ where: { id: folder.id }, data: { name: dto.name } });
      }

      if (chatIds) {
        // Replace the whole set: simpler and safer than diffing from the client.
        await tx.chatFolderAssignment.deleteMany({ where: { folderId: folder.id } });
        if (chatIds.length > 0) {
          await tx.chatFolderAssignment.createMany({
            data: chatIds.map((chatId) => ({ folderId: folder.id, chatId })),
          });
        }
      }
    });

    await this.publish(userId);
    const fresh = (await this.list(userId)).items.find((item) => item.id === folder.id);
    return fresh as FolderView;
  }

  async remove(userId: string, folderId: string) {
    const folder = await this.requireFolder(userId, folderId);
    await this.prisma.chatFolder.delete({ where: { id: folder.id } });
    await this.publish(userId);
    return { deleted: true };
  }

  async reorder(userId: string, dto: ReorderFoldersDto) {
    const owned = await this.prisma.chatFolder.findMany({
      where: { userId },
      select: { id: true },
    });
    const ownedIds = new Set(owned.map((folder) => folder.id));

    if (dto.folderIds.some((id) => !ownedIds.has(id))) {
      throw new NotFoundException('Folder not found');
    }

    await this.prisma.$transaction(
      dto.folderIds.map((id, position) =>
        this.prisma.chatFolder.update({ where: { id }, data: { position } }),
      ),
    );

    await this.publish(userId);
    return this.list(userId);
  }

  private async requireFolder(userId: string, folderId: string) {
    const folder = await this.prisma.chatFolder.findFirst({ where: { id: folderId, userId } });
    if (!folder) throw new NotFoundException('Folder not found');
    return folder;
  }

  /** Keeps only chats the user belongs to; a folder cannot reference foreign chats. */
  private async ownChatIds(userId: string, requested: string[] | undefined): Promise<string[]> {
    const unique = Array.from(new Set(requested ?? []));
    if (unique.length === 0) return [];

    if (unique.length > MAX_CHATS_PER_FOLDER) {
      throw new BadRequestException({
        message: `A folder can hold at most ${MAX_CHATS_PER_FOLDER} chats.`,
        code: 'FOLDER_CHATS_LIMIT',
      });
    }

    const memberships = await this.prisma.chatMember.findMany({
      where: { userId, chatId: { in: unique } },
      select: { chatId: true },
    });

    if (memberships.length !== unique.length) {
      throw new BadRequestException({
        message: 'One or more chats are not available to you.',
        code: 'FOLDER_CHAT_NOT_FOUND',
      });
    }
    return unique;
  }

  /** The full folder list is pushed, so every device converges on one state. */
  private async publish(userId: string) {
    this.realtime.emitToUser(userId, RealtimeEvent.FOLDER_UPDATED, await this.list(userId));
  }
}
