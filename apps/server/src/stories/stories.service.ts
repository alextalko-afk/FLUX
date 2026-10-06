import { BadRequestException, ForbiddenException, Injectable, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { PUBLIC_USER_SELECT } from '../privacy/public-user';
import { CreateStoryDto } from './stories.dto';

const TTL_MS = 24 * 3600 * 1000;
const PURGE_MS = 3600 * 1000;
const MAX_ACTIVE_PER_USER = 30;
const STORY_MIMES = /^(image\/(png|jpe?g|webp|gif)|video\/(mp4|webm|quicktime))$/;

type StoryRow = { id: string; authorId: string; fileObjectId: string; caption: string | null; createdAt: Date; expiresAt: Date };

@Injectable()
export class StoriesService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.purgeExpired().catch(() => undefined), PURGE_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private view(s: StoryRow, viewed: boolean, mimeType?: string) {
    return {
      id: s.id,
      authorId: s.authorId,
      caption: s.caption,
      url: `/api/v1/media/download/${s.fileObjectId}`,
      mimeType,
      createdAt: s.createdAt,
      expiresAt: s.expiresAt,
      viewed,
    };
  }

  /** Everyone connected to `userId` by a contact, in either direction, minus anyone blocked either way. */
  private async connectedTo(userId: string): Promise<Set<string>> {
    const [contacts, blocks] = await Promise.all([
      this.prisma.contact.findMany({ where: { OR: [{ ownerId: userId }, { targetId: userId }] }, select: { ownerId: true, targetId: true } }),
      this.prisma.blockedUser.findMany({ where: { OR: [{ ownerId: userId }, { targetId: userId }] }, select: { ownerId: true, targetId: true } }),
    ]);
    const ids = new Set(contacts.flatMap((c) => [c.ownerId, c.targetId]));
    for (const b of blocks) {
      ids.delete(b.ownerId);
      ids.delete(b.targetId);
    }
    ids.delete(userId);
    return ids;
  }

  async create(userId: string, dto: CreateStoryDto) {
    const file = await this.prisma.fileObject.findUnique({ where: { id: dto.fileObjectId } });
    if (!file || file.ownerId !== userId) throw new NotFoundException('File not found');
    if (!STORY_MIMES.test(file.mimeType)) {
      throw new BadRequestException({ message: 'Stories take a photo or a video.', code: 'STORY_BAD_FILE' });
    }
    const now = new Date();
    if ((await this.prisma.story.count({ where: { authorId: userId, expiresAt: { gt: now } } })) >= MAX_ACTIVE_PER_USER) {
      throw new BadRequestException({ message: 'Too many active stories.', code: 'STORY_LIMIT' });
    }
    const story = await this.prisma.story.create({
      data: { authorId: userId, fileObjectId: file.id, caption: dto.caption?.trim() || null, expiresAt: new Date(now.getTime() + TTL_MS) },
    });
    for (const id of await this.connectedTo(userId)) this.realtime.emitToUser(id, 'story.new', { authorId: userId, storyId: story.id });
    return this.view(story, true, file.mimeType);
  }

  /** Authors with a live story I may see: me first, then those with unseen stories. */
  async feed(userId: string) {
    const authorIds = [userId, ...(await this.connectedTo(userId))];
    const stories = await this.prisma.story.findMany({
      where: { authorId: { in: authorIds }, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'asc' },
      include: { views: { where: { viewerId: userId }, select: { viewerId: true } } },
    });
    const files = await this.prisma.fileObject.findMany({ where: { id: { in: stories.map((s) => s.fileObjectId) } }, select: { id: true, mimeType: true } });
    const mime = new Map(files.map((f) => [f.id, f.mimeType]));
    const byAuthor = new Map<string, ReturnType<StoriesService['view']>[]>();
    for (const s of stories) {
      const list = byAuthor.get(s.authorId) ?? [];
      list.push(this.view(s, s.authorId === userId || s.views.length > 0, mime.get(s.fileObjectId)));
      byAuthor.set(s.authorId, list);
    }
    const users = await this.prisma.user.findMany({ where: { id: { in: [...byAuthor.keys()] } }, select: PUBLIC_USER_SELECT });
    const items = users.map((author) => {
      const list = byAuthor.get(author.id)!;
      return { author, stories: list, hasUnseen: list.some((s) => !s.viewed) };
    });
    items.sort((a, b) => Number(b.author.id === userId) - Number(a.author.id === userId) || Number(b.hasUnseen) - Number(a.hasUnseen));
    return { items };
  }

  async markViewed(userId: string, storyId: string) {
    const story = await this.prisma.story.findFirst({ where: { id: storyId, expiresAt: { gt: new Date() } } });
    if (!story || (story.authorId !== userId && !(await this.connectedTo(userId)).has(story.authorId))) {
      throw new NotFoundException('Story not found');
    }
    if (story.authorId !== userId) {
      await this.prisma.storyView.upsert({
        where: { storyId_viewerId: { storyId, viewerId: userId } },
        create: { storyId, viewerId: userId },
        update: {},
      });
    }
    return { ok: true };
  }

  async viewers(userId: string, storyId: string) {
    const story = await this.prisma.story.findUnique({ where: { id: storyId } });
    if (!story) throw new NotFoundException('Story not found');
    if (story.authorId !== userId) throw new ForbiddenException('Only the author can see who viewed a story.');
    const views = await this.prisma.storyView.findMany({ where: { storyId }, orderBy: { viewedAt: 'desc' } });
    const users = await this.prisma.user.findMany({ where: { id: { in: views.map((v) => v.viewerId) } }, select: PUBLIC_USER_SELECT });
    const byId = new Map(users.map((u) => [u.id, u]));
    return { items: views.map((v) => ({ user: byId.get(v.viewerId), viewedAt: v.viewedAt })), total: views.length };
  }

  async remove(userId: string, storyId: string) {
    const res = await this.prisma.story.deleteMany({ where: { id: storyId, authorId: userId } });
    if (!res.count) throw new NotFoundException('Story not found');
    return { ok: true };
  }

  async purgeExpired() {
    await this.prisma.story.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  }
}
