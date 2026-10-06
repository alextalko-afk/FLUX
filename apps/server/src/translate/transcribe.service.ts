import { BadRequestException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { S3Service } from '../files/s3.service';

const CACHE_TTL_S = 30 * 24 * 3600;
const MAX_BYTES = 25 * 1024 * 1024;
const TIMEOUT_MS = 60_000;

/** Turns a voice message into text through an OpenAI-compatible `/audio/transcriptions` API (`TRANSCRIBE_URL`). */
@Injectable()
export class TranscribeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
    private readonly s3: S3Service,
  ) {}

  async transcribe(userId: string, messageId: string) {
    const url = this.config.get<string>('TRANSCRIBE_URL');
    if (!url) {
      throw new ServiceUnavailableException({ message: 'Transcription is not configured.', code: 'TRANSCRIBE_DISABLED' });
    }
    const message = await this.prisma.message.findFirst({ where: { id: messageId, isDeleted: false }, include: { media: { include: { fileObject: true } } } });
    if (!message) throw new NotFoundException('Message not found');
    const member = await this.prisma.chatMember.findFirst({ where: { chatId: message.chatId, userId } });
    if (!member) throw new ForbiddenException('Not a member of this chat');
    const file = message.media?.fileObject;
    if (message.type !== 'VOICE' || !file) {
      throw new BadRequestException({ message: 'Only voice messages can be transcribed.', code: 'TRANSCRIBE_NOT_VOICE' });
    }
    if (file.size > MAX_BYTES) {
      throw new BadRequestException({ message: 'Voice message is too large.', code: 'TRANSCRIBE_TOO_LARGE' });
    }

    const key = `transcribe:${file.id}`;
    const cached = await this.redis.get(key);
    if (cached) return { text: cached, cached: true };

    const audio = await this.s3.getObjectBuffer(file.bucket, file.key);
    if (!audio) throw new NotFoundException('Audio file not found');

    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(audio)], { type: file.mimeType }), 'voice');
    form.append('model', this.config.get<string>('TRANSCRIBE_MODEL') || 'whisper-1');
    const apiKey = this.config.get<string>('TRANSCRIBE_API_KEY');

    let res: Response;
    try {
      res = await fetch(`${url.replace(/\/$/, '')}/audio/transcriptions`, {
        method: 'POST',
        headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
        body: form,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      throw new ServiceUnavailableException({ message: 'Transcription service is unreachable.', code: 'TRANSCRIBE_UNAVAILABLE' });
    }
    const body = res.ok ? ((await res.json()) as { text?: string }) : null;
    if (typeof body?.text !== 'string') {
      throw new ServiceUnavailableException({ message: 'Transcription failed.', code: 'TRANSCRIBE_UNAVAILABLE' });
    }
    await this.redis.set(key, body.text, CACHE_TTL_S);
    return { text: body.text, cached: false };
  }
}
