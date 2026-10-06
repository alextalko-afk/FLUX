import { Injectable } from '@nestjs/common';
import {
  IRealtimeMessage,
  IRealtimeSyncResponse,
  REALTIME_PROTOCOL_VERSION,
  REALTIME_REPLAY_WINDOW,
  REALTIME_SYNC_PAGE_SIZE,
} from '@FLUX/shared';
import { RedisService } from '../redis/redis.service';

const LOG_TTL_SECONDS = 7 * 24 * 60 * 60;

const seqKey = (userId: string) => `rt:seq:${userId}`;
const logKey = (userId: string) => `rt:log:${userId}`;

/**
 * Per-user, ordered log of durable realtime events.
 *
 * Every durable event gets the next sequence id of the recipient and is kept
 * in a Redis sorted set (score = sequence id) for a bounded window. A client
 * that was offline, or that noticed a gap, replays what it missed through
 * {@link since} instead of refetching everything.
 *
 * Sequence ids are per user, not per device: all of a user's sockets receive
 * the same numbered stream, so a second device catches up with the same call.
 */
@Injectable()
export class RealtimeEventLogService {
  constructor(private readonly redis: RedisService) {}

  /**
   * Allocates the next sequence id for `userId` and stores the event under it.
   * Returns the id to stamp on the outgoing envelope.
   */
  async append(
    userId: string,
    event: string,
    payload: unknown,
    timestamp: number,
  ): Promise<number> {
    const client = this.redis.getClient();
    const sequenceId = await client.incr(seqKey(userId));

    const message: IRealtimeMessage = {
      event,
      payload,
      timestamp,
      version: REALTIME_PROTOCOL_VERSION,
      sequenceId,
    };

    await client
      .multi()
      .zadd(logKey(userId), sequenceId, JSON.stringify(message))
      // Keep only the newest REPLAY_WINDOW entries (ranks are ascending).
      .zremrangebyrank(logKey(userId), 0, -(REALTIME_REPLAY_WINDOW + 1))
      .expire(logKey(userId), LOG_TTL_SECONDS)
      .expire(seqKey(userId), LOG_TTL_SECONDS)
      .exec();

    return sequenceId;
  }

  /** Newest sequence id issued to the user, or 0 when none was issued yet. */
  async head(userId: string): Promise<number> {
    const raw = await this.redis.getClient().get(seqKey(userId));
    return raw ? Number.parseInt(raw, 10) || 0 : 0;
  }

  /** Events with a sequence id greater than `after`, oldest first. */
  async since(userId: string, after: number): Promise<IRealtimeSyncResponse> {
    const client = this.redis.getClient();
    const head = await this.head(userId);

    if (after === head) {
      return { events: [], head, hasMore: false, reset: false };
    }

    // The client claims to have seen events the server never issued: Redis was
    // flushed, or the cursor belongs to another environment.
    if (after > head) {
      return { events: [], head, hasMore: false, reset: true };
    }

    const oldest = await client.zrange(logKey(userId), 0, 0, 'WITHSCORES');
    const oldestId = oldest.length === 2 ? Number.parseInt(oldest[1], 10) : null;

    // Everything after `after` must still be in the log, otherwise the gap
    // contains events we can no longer replay.
    if (oldestId === null || oldestId > after + 1) {
      return { events: [], head, hasMore: false, reset: true };
    }

    const rows = await client.zrangebyscore(
      logKey(userId),
      `(${after}`,
      '+inf',
      'LIMIT',
      0,
      REALTIME_SYNC_PAGE_SIZE,
    );

    const events = rows.map((row) => JSON.parse(row) as IRealtimeMessage);
    const last = events.length > 0 ? events[events.length - 1].sequenceId ?? after : after;

    return { events, head, hasMore: last < head && events.length > 0, reset: false };
  }
}
