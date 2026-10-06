import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** Seconds until the window resets (always >= 1). */
  retryAfterSeconds: number;
}

/**
 * Atomic fixed-window counter. INCR and EXPIRE run in one Lua script so a crash
 * between them can never leave a counter without a TTL (which would block the
 * caller forever).
 */
const HIT_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('TTL', KEYS[1])
if ttl < 0 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
return {count, ttl}
`;

@Injectable()
export class RateLimitService {
  private readonly logger = new Logger(RateLimitService.name);

  constructor(private readonly redis: RedisService) {}

  /**
   * Counts one hit against `key`. Fails open when Redis is unreachable: losing
   * the limiter for a moment is better than taking the whole API down with it.
   */
  async hit(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
    try {
      const [count, ttl] = (await this.redis
        .getClient()
        .eval(HIT_SCRIPT, 1, `rl:${key}`, String(windowSeconds))) as [number, number];

      return {
        allowed: count <= limit,
        limit,
        remaining: Math.max(0, limit - count),
        retryAfterSeconds: Math.max(1, ttl),
      };
    } catch (err) {
      this.logger.warn(`Rate limiter unavailable, allowing request: ${err}`);
      return { allowed: true, limit, remaining: limit, retryAfterSeconds: 1 };
    }
  }
}
