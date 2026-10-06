import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PUBLIC_USER_SELECT, projectChat, projectMessage } from '../privacy/public-user';
import {
  GlobalSearchQueryDto,
  ChatSearchQueryDto,
  MessageSearchQueryDto,
  SearchScope,
} from './dto/search.dto';

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  private toPublicUser(user: any) {
    return {
      id: user.id,
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      bio: user.bio,
      avatarUrl: user.avatarUrl,
      presence: user.presence,
      lastSeenAt: user.lastSeenAt,
      isVerified: user.isVerified,
    };
  }

  async searchUsers(query: string, limit = 20) {
    const normalized = query.trim().replace(/^@/, '');
    const users = await this.prisma.user.findMany({
      where: {
        isBlocked: false,
        OR: [
          { username: { contains: normalized, mode: 'insensitive' } },
          { firstName: { contains: normalized, mode: 'insensitive' } },
          { lastName: { contains: normalized, mode: 'insensitive' } },
        ],
      },
      take: limit,
      orderBy: { username: 'asc' },
    });
    return users.map((u) => this.toPublicUser(u));
  }

  async searchChats(userId: string, query: ChatSearchQueryDto) {
    const take = query.limit ?? 20;
    const chats = await this.prisma.chat.findMany({
      where: {
        members: { some: { userId } },
        OR: [
          { title: { contains: query.q, mode: 'insensitive' } },
          { description: { contains: query.q, mode: 'insensitive' } },
        ],
      },
      take,
      cursor: query.cursor ? { id: query.cursor } : undefined,
      skip: query.cursor ? 1 : 0,
      orderBy: { updatedAt: 'desc' },
      include: { members: { include: { user: { select: PUBLIC_USER_SELECT } } } },
    });

    return {
      items: chats.map((chat) => projectChat(chat, userId)),
      nextCursor: chats.length === take ? chats[chats.length - 1].id : null,
    };
  }

  async searchMessages(userId: string, query: MessageSearchQueryDto) {
    const take = query.limit ?? 20;
    const where: any = {
      isDeleted: false,
      content: { contains: query.q, mode: 'insensitive' },
      // Secret chats hold ciphertext only; there is nothing meaningful to search.
      chat: { members: { some: { userId } }, type: { not: 'SECRET' }, e2ee: false },
    };
    if (query.chatId) {
      where.chatId = query.chatId;
    }

    const messages = await this.prisma.message.findMany({
      where,
      take,
      cursor: query.cursor ? { id: query.cursor } : undefined,
      skip: query.cursor ? 1 : 0,
      orderBy: { createdAt: 'desc' },
      include: {
        sender: { select: PUBLIC_USER_SELECT },
        chat: { include: { members: true } },
      },
    });

    return {
      items: messages.map((message) => projectMessage(message, userId)),
      nextCursor: messages.length === take ? messages[messages.length - 1]?.id || null : null,
    };
  }

  async globalSearch(userId: string, query: GlobalSearchQueryDto) {
    const scope = query.scope ?? SearchScope.ALL;
    const limit = query.limit ?? 20;
    const result: any = {};

    if (scope === SearchScope.ALL || scope === SearchScope.USERS) {
      result.users = await this.searchUsers(query.q, limit);
    }

    if (scope === SearchScope.ALL || scope === SearchScope.CHATS) {
      const chats = await this.searchChats(userId, {
        q: query.q,
        limit,
        cursor: query.cursor,
      });
      result.chats = chats.items;
    }

    if (scope === SearchScope.ALL || scope === SearchScope.MESSAGES) {
      const messages = await this.searchMessages(userId, {
        q: query.q,
        limit,
        cursor: query.cursor,
      });
      result.messages = messages.items;
    }

    return result;
  }
}
