import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ChatMemberRole } from '@FLUX/shared';
import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';

export class CreateTopicDto {
  @IsString() @MinLength(1) @MaxLength(64) title!: string;
  @IsOptional() @IsString() @MaxLength(16) iconEmoji?: string;
}

export class UpdateTopicDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(64) title?: string;
  @IsOptional() @IsString() @MaxLength(16) iconEmoji?: string;
  @IsOptional() @IsBoolean() isClosed?: boolean;
}

@Injectable()
export class TopicsService {
  constructor(private readonly prisma: PrismaService) {}

  private async member(userId: string, chatId: string) {
    const member = await this.prisma.chatMember.findFirst({ where: { chatId, userId } });
    if (!member) throw new ForbiddenException('Not a member of this chat');
    return member;
  }

  private async admin(userId: string, chatId: string) {
    const member = await this.member(userId, chatId);
    if (member.role !== ChatMemberRole.OWNER && member.role !== ChatMemberRole.ADMIN) {
      throw new ForbiddenException('Only admins can manage topics');
    }
  }

  private async assertForum(chatId: string) {
    const chat = await this.prisma.chat.findUnique({ where: { id: chatId }, select: { isForum: true } });
    if (!chat) throw new NotFoundException('Chat not found');
    if (!chat.isForum) throw new BadRequestException({ message: 'This chat is not a forum.', code: 'NOT_A_FORUM' });
  }

  async list(userId: string, chatId: string) {
    await this.member(userId, chatId);
    await this.assertForum(chatId);
    const topics = await this.prisma.topic.findMany({
      where: { chatId },
      orderBy: { createdAt: 'asc' },
      include: { _count: { select: { messages: { where: { isDeleted: false } } } } },
    });
    return {
      items: topics.map(({ _count, ...t }) => ({ ...t, messageCount: _count.messages })),
    };
  }

  async create(userId: string, chatId: string, dto: CreateTopicDto) {
    await this.admin(userId, chatId);
    await this.assertForum(chatId);
    return this.prisma.topic.create({
      data: { chatId, title: dto.title.trim(), iconEmoji: dto.iconEmoji, createdBy: userId },
    });
  }

  private async load(chatId: string, topicId: string) {
    const topic = await this.prisma.topic.findFirst({ where: { id: topicId, chatId } });
    if (!topic) throw new NotFoundException({ message: 'Topic not found.', code: 'TOPIC_NOT_FOUND' });
    return topic;
  }

  async update(userId: string, chatId: string, topicId: string, dto: UpdateTopicDto) {
    await this.admin(userId, chatId);
    await this.load(chatId, topicId);
    return this.prisma.topic.update({
      where: { id: topicId },
      data: { title: dto.title?.trim(), iconEmoji: dto.iconEmoji, isClosed: dto.isClosed },
    });
  }

  /** Deleting a topic deletes the messages posted in it. */
  async remove(userId: string, chatId: string, topicId: string) {
    await this.admin(userId, chatId);
    await this.load(chatId, topicId);
    await this.prisma.topic.delete({ where: { id: topicId } });
    return { deleted: true };
  }
}
