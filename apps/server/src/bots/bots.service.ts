import { BadGatewayException } from '@nestjs/common';
import { webhookSignatureHeader } from './bot-webhooks.sign';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateBotDto,
  CreateBotCommandDto,
  CreateBotWebhookDto,
  UpdateBotWebhookDto,
  BotSendMessageWithKeyboardDto,
  BotEditMessageDto,
  BotDeleteMessageDto,
} from './dto/bots.dto';
import { MessageStatus, MessageType } from '@FLUX/shared';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { BotUpdate, BotWebhookService } from './bot-webhooks.service';

@Injectable()
export class BotsService {
  private readonly logger = new Logger(BotsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
    private readonly botWebhooks: BotWebhookService,
  ) {}

  /**
   * Fire-and-forget fan-out to bot webhooks. A queue hiccup must never break
   * the HTTP call that produced the update.
   */
  private dispatchUpdate(
    actorId: string,
    chatId: string,
    update: BotUpdate,
  ): void {
    void this.botWebhooks
      .dispatchToChat(chatId, actorId, update)
      .catch((err) => this.logger.warn(`Bot webhook dispatch failed: ${err}`));
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private generateToken(): string {
    return `${randomBytes(20).toString('hex')}`;
  }

  async createBot(ownerId: string, dto: CreateBotDto) {
    const existingUsername = await this.prisma.user.findUnique({
      where: { username: dto.username },
    });
    if (existingUsername) {
      throw new BadRequestException('Username already taken');
    }

    const existingBot = await this.prisma.bot.findUnique({
      where: { username: dto.username },
    });
    if (existingBot) {
      throw new BadRequestException('Bot username already taken');
    }

    const rawToken = this.generateToken();
    const tokenHash = this.hashToken(rawToken);

    const bot = await this.prisma.bot.create({
      data: {
        ownerId,
        name: dto.name,
        username: dto.username,
        description: dto.description || null,
        tokenHash,
        isActive: true,
      },
    });

    return {
      id: bot.id,
      name: bot.name,
      username: bot.username,
      token: rawToken,
      createdAt: bot.createdAt,
    };
  }

  async updateBot(ownerId: string, botId: string, dto: { name?: string; description?: string; isPublic?: boolean }) {
    const bot = await this.prisma.bot.findFirst({ where: { id: botId, ownerId } });
    if (!bot) throw new NotFoundException('Bot not found');
    const updated = await this.prisma.bot.update({
      where: { id: botId },
      data: { name: dto.name, description: dto.description, isPublic: dto.isPublic },
    });
    return { id: updated.id, name: updated.name, description: updated.description, isPublic: updated.isPublic };
  }

  /** Public bots anyone may find: only active ones whose owner opted in. */
  async catalog(q?: string) {
    const term = q?.trim().replace(/^@/, '');
    const bots = await this.prisma.bot.findMany({
      where: {
        isPublic: true,
        isActive: true,
        ...(term
          ? { OR: [{ name: { contains: term, mode: 'insensitive' } }, { username: { contains: term, mode: 'insensitive' } }, { description: { contains: term, mode: 'insensitive' } }] }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 30,
      include: { commands: { select: { command: true, description: true } } },
    });
    return {
      items: bots.map((b) => ({ id: b.id, name: b.name, username: b.username, description: b.description, avatarUrl: b.avatarUrl, commands: b.commands })),
    };
  }

  async listBots(ownerId: string) {
    const bots = await this.prisma.bot.findMany({
      where: { ownerId },
      orderBy: { createdAt: 'desc' },
      include: {
        commands: true,
        webhooks: true,
      },
    });

    return {
      items: bots.map((bot) => ({
        id: bot.id,
        name: bot.name,
        username: bot.username,
        description: bot.description,
        isPublic: bot.isPublic,
        avatarUrl: bot.avatarUrl,
        isActive: bot.isActive,
        commands: bot.commands,
        webhooks: bot.webhooks.map((w) => ({
          id: w.id,
          url: w.url,
          isActive: w.isActive,
        })),
        createdAt: bot.createdAt,
      })),
    };
  }

  async getBot(ownerId: string, botId: string) {
    const bot = await this.prisma.bot.findFirst({
      where: { id: botId, ownerId },
      include: { commands: true, webhooks: true },
    });
    if (!bot) throw new NotFoundException('Bot not found');
    return bot;
  }

  async deleteBot(ownerId: string, botId: string) {
    const bot = await this.prisma.bot.findFirst({
      where: { id: botId, ownerId },
    });
    if (!bot) throw new NotFoundException('Bot not found');

    await this.prisma.bot.delete({ where: { id: botId } });
    return { deleted: true };
  }

  async regenerateToken(ownerId: string, botId: string) {
    const bot = await this.prisma.bot.findFirst({
      where: { id: botId, ownerId },
    });
    if (!bot) throw new NotFoundException('Bot not found');

    const rawToken = this.generateToken();
    const tokenHash = this.hashToken(rawToken);

    await this.prisma.bot.update({
      where: { id: botId },
      data: { tokenHash },
    });

    return { token: rawToken };
  }

  async addCommand(ownerId: string, botId: string, dto: CreateBotCommandDto) {
    const bot = await this.prisma.bot.findFirst({
      where: { id: botId, ownerId },
    });
    if (!bot) throw new NotFoundException('Bot not found');

    const existing = await this.prisma.botCommand.findFirst({
      where: { botId, command: dto.command },
    });
    if (existing) {
      throw new BadRequestException('Command already exists');
    }

    const command = await this.prisma.botCommand.create({
      data: {
        botId,
        command: dto.command,
        description: dto.description,
      },
    });

    return command;
  }

  async removeCommand(ownerId: string, botId: string, commandId: string) {
    const bot = await this.prisma.bot.findFirst({
      where: { id: botId, ownerId },
    });
    if (!bot) throw new NotFoundException('Bot not found');

    const command = await this.prisma.botCommand.findFirst({
      where: { id: commandId, botId },
    });
    if (!command) throw new NotFoundException('Command not found');

    await this.prisma.botCommand.delete({ where: { id: commandId } });
    return { deleted: true };
  }

  async addWebhook(ownerId: string, botId: string, dto: CreateBotWebhookDto) {
    const bot = await this.prisma.bot.findFirst({
      where: { id: botId, ownerId },
    });
    if (!bot) throw new NotFoundException('Bot not found');

    const webhook = await this.prisma.botWebhook.create({
      data: {
        botId,
        url: dto.url,
        secret: dto.secret,
        isActive: true,
      },
    });

    return webhook;
  }

  async updateWebhook(
    ownerId: string,
    botId: string,
    webhookId: string,
    dto: UpdateBotWebhookDto,
  ) {
    const bot = await this.prisma.bot.findFirst({
      where: { id: botId, ownerId },
    });
    if (!bot) throw new NotFoundException('Bot not found');

    const webhook = await this.prisma.botWebhook.findFirst({
      where: { id: webhookId, botId },
    });
    if (!webhook) throw new NotFoundException('Webhook not found');

    const updated = await this.prisma.botWebhook.update({
      where: { id: webhookId },
      data: {
        url: dto.url,
        isActive: dto.isActive,
      },
    });

    return updated;
  }

  async removeWebhook(ownerId: string, botId: string, webhookId: string) {
    const bot = await this.prisma.bot.findFirst({
      where: { id: botId, ownerId },
    });
    if (!bot) throw new NotFoundException('Bot not found');

    await this.prisma.botWebhook.deleteMany({
      where: { id: webhookId, botId },
    });

    return { deleted: true };
  }

  async sendMessageByToken(token: string, dto: BotSendMessageWithKeyboardDto) {
    const tokenHash = this.hashToken(token);
    const bot = await this.prisma.bot.findFirst({
      where: { tokenHash, isActive: true },
    });
    if (!bot) throw new ForbiddenException('Invalid bot token');

    const chat = await this.prisma.chat.findUnique({
      where: { id: dto.chatId },
      select: { id: true },
    });
    if (!chat) throw new NotFoundException('Chat not found');

    // A bot may only speak in chats its owner belongs to. Checking for *any*
    // member (the previous behaviour) let a token post into any chat.
    const membership = await this.prisma.chatMember.findFirst({
      where: { chatId: dto.chatId, userId: bot.ownerId },
    });
    if (!membership) {
      throw new ForbiddenException('Bot owner is not a member of this chat');
    }

    for (const button of dto.keyboard?.flatMap((r) => r.row) ?? []) {
      if (!button.callbackData && !button.webAppUrl) {
        throw new BadRequestException({ message: 'A button needs callbackData or webAppUrl.', code: 'BOT_BUTTON_EMPTY' });
      }
      if (button.webAppUrl && !isAllowedWebAppUrl(button.webAppUrl)) {
        throw new BadRequestException({ message: 'Mini-apps must be served over https.', code: 'BOT_WEBAPP_URL' });
      }
    }
    const content = dto.keyboard
      ? JSON.stringify({ text: dto.text, keyboard: dto.keyboard, botId: bot.id })
      : dto.text;

    const message = await this.prisma.message.create({
      data: {
        chatId: dto.chatId,
        senderId: bot.ownerId,
        type: MessageType.TEXT,
        content,
        status: MessageStatus.SENT,
        replyToMessageId: dto.replyToMessageId,
      },
    });

    const members = await this.prisma.chatMember.findMany({
      where: { chatId: dto.chatId },
    });
    for (const m of members) {
      this.realtime.emitToUser(m.userId, 'message.new', {
        chatId: dto.chatId,
        message,
        isSelf: m.userId === bot.ownerId,
      });
    }

    this.dispatchUpdate(bot.ownerId, dto.chatId, {
      event: 'message.new',
      timestamp: Date.now(),
      chatId: dto.chatId,
      message,
    });

    return { messageId: message.id };
  }

  /** A member pressed an inline button: forward `callback_query` to the bot that posted the message. */
  /**
   * Inline mode: asks the bot's webhook synchronously for results to the typed query.
   * The bot answers with `{ results: [{ id, title, text }] }` within 3 seconds.
   */
  async inlineQuery(userId: string, username: string, q: string) {
    const bot = await this.prisma.bot.findFirst({
      where: { username: username.replace(/^@/, '').toLowerCase(), isActive: true },
      include: { webhooks: { where: { isActive: true }, take: 1 } },
    });
    const webhook = bot?.webhooks[0];
    if (!bot || !webhook) throw new NotFoundException('Bot not found');

    const body = JSON.stringify({ event: 'inline_query', timestamp: Date.now(), fromUserId: userId, query: q });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    try {
      const res = await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-FLUX-Event': 'inline_query',
          'X-FLUX-Signature': webhookSignatureHeader(webhook.secret, body),
        },
        body,
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(String(res.status));
      const json = (await res.json()) as { results?: { id?: unknown; title?: unknown; text?: unknown }[] };
      const results = (json.results ?? [])
        .filter((r) => typeof r.text === 'string' && r.text.length > 0)
        .slice(0, 20)
        .map((r, i) => ({ id: String(r.id ?? i), title: String(r.title ?? r.text).slice(0, 100), text: String(r.text).slice(0, 4000) }));
      return { bot: { name: bot.name, username: bot.username }, results };
    } catch {
      throw new BadGatewayException({ message: 'The bot did not answer.', code: 'BOT_INLINE_FAILED' });
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Opens a mini-app button: returns the page URL and signed `initData` the page can verify.
   * The signature is HMAC-SHA256 over the sorted `key=value` lines (joined with \n, `hash` excluded),
   * keyed with the bot's token hash: `sha256(botToken)` as hex, which the bot owner can compute.
   */
  async webAppSession(userId: string, messageId: string, url: string) {
    const message = await this.prisma.message.findFirst({ where: { id: messageId, isDeleted: false } });
    if (!message) throw new NotFoundException('Message not found');
    const member = await this.prisma.chatMember.findFirst({ where: { chatId: message.chatId, userId } });
    if (!member) throw new ForbiddenException('Not a member of this chat');

    let card: { keyboard?: { row?: { webAppUrl?: string }[] }[]; botId?: string } = {};
    try {
      card = JSON.parse(message.content);
    } catch {
      // Plain text message: no buttons.
    }
    if (!card.botId || !card.keyboard?.some((r) => r.row?.some((b) => b.webAppUrl === url))) {
      throw new BadRequestException({ message: 'No such mini-app on this message.', code: 'BOT_WEBAPP_UNKNOWN' });
    }
    const bot = await this.prisma.bot.findFirst({ where: { id: card.botId, isActive: true } });
    if (!bot) throw new NotFoundException('Bot not found');
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, firstName: true, lastName: true, username: true },
    });

    const params: Record<string, string> = {
      auth_date: String(Math.floor(Date.now() / 1000)),
      chat_id: message.chatId,
      message_id: messageId,
      user: JSON.stringify(user),
    };
    const checkString = Object.keys(params)
      .sort()
      .map((k) => `${k}=${params[k]}`)
      .join('\n');
    const hash = createHmac('sha256', bot.tokenHash).update(checkString).digest('hex');
    return { url, initData: new URLSearchParams({ ...params, hash }).toString() };
  }

  async pressButton(userId: string, messageId: string, data: string) {
    const message = await this.prisma.message.findFirst({ where: { id: messageId, isDeleted: false } });
    if (!message) throw new NotFoundException('Message not found');
    const member = await this.prisma.chatMember.findFirst({ where: { chatId: message.chatId, userId } });
    if (!member) throw new ForbiddenException('Not a member of this chat');

    let keyboard: { row?: { callbackData?: string }[] }[] = [];
    try {
      keyboard = JSON.parse(message.content).keyboard ?? [];
    } catch {
      // Plain text message: no buttons.
    }
    if (!keyboard.some((r) => r.row?.some((b) => b.callbackData === data))) {
      throw new BadRequestException({ message: 'No such button on this message.', code: 'BOT_BUTTON_UNKNOWN' });
    }
    const delivered = await this.botWebhooks.dispatchToOwner(message.senderId, {
      event: 'callback_query',
      timestamp: Date.now(),
      chatId: message.chatId,
      messageId,
      data,
      fromUserId: userId,
    });
    return { delivered: delivered > 0 };
  }

  async editMessageByToken(token: string, dto: BotEditMessageDto) {
    const tokenHash = this.hashToken(token);
    const bot = await this.prisma.bot.findFirst({
      where: { tokenHash, isActive: true },
    });
    if (!bot) throw new ForbiddenException('Invalid bot token');

    const message = await this.prisma.message.findFirst({
      where: { id: dto.messageId, senderId: bot.ownerId },
    });
    if (!message) throw new NotFoundException('Message not found');

    const updated = await this.prisma.message.update({
      where: { id: dto.messageId },
      data: { content: dto.text, isEdited: true },
    });

    const members = await this.prisma.chatMember.findMany({
      where: { chatId: message.chatId },
    });
    for (const m of members) {
      this.realtime.emitToUser(m.userId, 'message.updated', {
        chatId: message.chatId,
        message: updated,
      });
    }

    this.dispatchUpdate(bot.ownerId, message.chatId, {
      event: 'message.updated',
      timestamp: Date.now(),
      chatId: message.chatId,
      message: updated,
    });

    return { success: true };
  }

  async deleteMessageByToken(token: string, dto: BotDeleteMessageDto) {
    const tokenHash = this.hashToken(token);
    const bot = await this.prisma.bot.findFirst({
      where: { tokenHash, isActive: true },
    });
    if (!bot) throw new ForbiddenException('Invalid bot token');

    const message = await this.prisma.message.findFirst({
      where: { id: dto.messageId, senderId: bot.ownerId },
    });
    if (!message) throw new NotFoundException('Message not found');

    await this.prisma.message.update({
      where: { id: dto.messageId },
      data: { isDeleted: true, content: '' },
    });

    const members = await this.prisma.chatMember.findMany({
      where: { chatId: message.chatId },
    });
    for (const m of members) {
      this.realtime.emitToUser(m.userId, 'message.deleted', {
        chatId: message.chatId,
        messageId: message.id,
      });
    }

    this.dispatchUpdate(bot.ownerId, message.chatId, {
      event: 'message.deleted',
      timestamp: Date.now(),
      chatId: message.chatId,
      messageId: message.id,
    });

    return { success: true };
  }

  async listAllBotsForAdmin(limit = 100, cursor?: string) {
    const bots = await this.prisma.bot.findMany({
      take: limit,
      cursor: cursor ? { id: cursor } : undefined,
      skip: cursor ? 1 : 0,
      orderBy: { createdAt: 'desc' },
      include: {
        owner: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    return {
      items: bots,
      nextCursor: bots.length === limit ? bots[bots.length - 1]?.id || null : null,
    };
  }

  async toggleBotForAdmin(adminId: string, botId: string, isActive: boolean) {
    const bot = await this.prisma.bot.update({
      where: { id: botId },
      data: { isActive },
    });
    return bot;
  }
}

/** Mini-apps must be https, except for local development pages. */
function isAllowedWebAppUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname));
  } catch {
    return false;
  }
}
