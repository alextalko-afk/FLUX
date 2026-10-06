import { SetMetadata } from '@nestjs/common';

export const RATE_LIMIT_KEY = 'rate-limit';
export const SKIP_RATE_LIMIT_KEY = 'skip-rate-limit';

export interface RateLimitOptions {
  /** Maximum requests per window. */
  limit: number;
  /** Window length in seconds. */
  windowSeconds: number;
  /**
   * `ip` is enforced before authentication, so it also covers floods of
   * invalid credentials. `user` is enforced after authentication and is the
   * right choice for actions of a signed-in account (a shared office IP must
   * not throttle everyone behind it).
   */
  scope?: 'ip' | 'user';
}

/** Applies a stricter limit to one route on top of the global per-IP limit. */
export const RateLimit = (options: RateLimitOptions) =>
  SetMetadata(RATE_LIMIT_KEY, { scope: 'ip', ...options } satisfies RateLimitOptions);

/** Exempts a route (health checks, probes) from every rate limit. */
export const SkipRateLimit = () => SetMetadata(SKIP_RATE_LIMIT_KEY, true);
