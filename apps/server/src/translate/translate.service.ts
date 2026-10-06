import { BadRequestException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

const CACHE_TTL_S = 24 * 3600;
const TIMEOUT_MS = 8000;
const MAX_CHARS = 4000;

/** Translates a message through a LibreTranslate-compatible HTTP API (`TRANSLATE_URL`). */
@Injectable()
export class TranslateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {}

  async translate(userId: string, messageId: string, target: string) {
    const url = this.config.get<string>('TRANSLATE_URL');
    if (!url) {
      throw new ServiceUnavailableException({ message: 'Translation is not configured.', code: 'TRANSLATE_DISABLED' });
    }
    const message = await this.prisma.message.findFirst({ where: { id: messageId, isDeleted: false } });
    if (!message) throw new NotFoundException('Message not found');
    const member = await this.prisma.chatMember.findFirst({ where: { chatId: message.chatId, userId } });
    if (!member) throw new ForbiddenException('Not a member of this chat');
    const chat = await this.prisma.chat.findUnique({ where: { id: message.chatId }, select: { type: true, e2ee: true } });
    const text = message.content.trim();
    if (!text || chat?.type === 'SECRET' || chat?.e2ee) {
      throw new BadRequestException({ message: 'Nothing to translate.', code: 'TRANSLATE_EMPTY' });
    }
    if (text.length > MAX_CHARS) {
      throw new BadRequestException({ message: 'Message is too long to translate.', code: 'TRANSLATE_TOO_LONG' });
    }

    const key = `translate:${target}:${createHash('sha1').update(text).digest('hex')}`;
    const cached = await this.redis.get(key);
    if (cached) return { ...(JSON.parse(cached) as object), cached: true };

    let res: Response;
    try {
      res = await fetch(`${url.replace(/\/$/, '')}/translate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: text, source: 'auto', target, format: 'text', api_key: this.config.get<string>('TRANSLATE_API_KEY') || undefined }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      throw new ServiceUnavailableException({ message: 'Translation service is unreachable.', code: 'TRANSLATE_UNAVAILABLE' });
    }
    if (!res.ok) throw new ServiceUnavailableException({ message: 'Translation failed.', code: 'TRANSLATE_UNAVAILABLE' });
    const body = (await res.json()) as { translatedText?: string; detectedLanguage?: { language?: string } };
    if (typeof body.translatedText !== 'string') {
      throw new ServiceUnavailableException({ message: 'Translation failed.', code: 'TRANSLATE_UNAVAILABLE' });
    }
    const result = { text: body.translatedText, target, detected: body.detectedLanguage?.language ?? null };
    await this.redis.set(key, JSON.stringify(result), CACHE_TTL_S);
    return { ...result, cached: false };
  }
}
