import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { RedisService } from '../redis/redis.service';

const TICKET_TTL_SECONDS = 30;

/**
 * One-time tickets for opening a WebSocket. A browser cannot put an
 * Authorization header on a WebSocket, and a long-lived access token in the URL
 * ends up in proxy and access logs. A ticket is valid for 30 seconds, works
 * once, and is useless in a log afterwards.
 */
@Injectable()
export class WsTicketService {
  constructor(private readonly redis: RedisService) {}

  private key(ticket: string) {
    return `wsticket:${createHash('sha256').update(ticket).digest('hex')}`;
  }

  async issue(userId: string, sessionId: string): Promise<{ ticket: string; expiresIn: number }> {
    const ticket = randomBytes(32).toString('base64url');
    await this.redis.set(this.key(ticket), JSON.stringify({ userId, sessionId }), TICKET_TTL_SECONDS);
    return { ticket, expiresIn: TICKET_TTL_SECONDS };
  }

  /** Returns who the ticket belongs to and burns it; null if unknown, used or expired. */
  async redeem(ticket: string): Promise<{ userId: string; sessionId: string } | null> {
    if (!/^[A-Za-z0-9_-]{40,64}$/.test(ticket)) return null;
    const results = await this.redis.getClient().multi().get(this.key(ticket)).del(this.key(ticket)).exec();
    const raw = results?.[0]?.[1];
    if (typeof raw !== 'string') return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
}
