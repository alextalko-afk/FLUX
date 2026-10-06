import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import {
  RATE_LIMIT_KEY,
  RateLimitOptions,
  SKIP_RATE_LIMIT_KEY,
} from './rate-limit.decorator';
import { RateLimitResult, RateLimitService } from './rate-limit.service';

export function tooManyRequests(result: RateLimitResult, response: any): never {
  response.setHeader('Retry-After', String(result.retryAfterSeconds));
  response.setHeader('X-RateLimit-Limit', String(result.limit));
  response.setHeader('X-RateLimit-Remaining', '0');
  throw new HttpException(
    {
      statusCode: HttpStatus.TOO_MANY_REQUESTS,
      message: 'Too many requests. Try again later.',
      error: 'Too Many Requests',
      retryAfterSeconds: result.retryAfterSeconds,
    },
    HttpStatus.TOO_MANY_REQUESTS,
  );
}

/**
 * Global per-IP limiter. It runs before authentication, so unauthenticated
 * floods (credential stuffing, registration spam, invalid tokens) are counted
 * too. Routes may add a stricter `scope: 'ip'` limit with `@RateLimit`.
 *
 * `scope: 'user'` limits are handled by {@link UserRateLimitInterceptor}
 * because the account is only known after the auth guards have run.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly defaultLimit: number;
  private readonly defaultWindowSeconds: number;

  constructor(
    private readonly limiter: RateLimitService,
    private readonly reflector: Reflector,
    config: ConfigService,
  ) {
    this.defaultLimit = Number(config.get('RATE_LIMIT_MAX_REQUESTS')) || 300;
    this.defaultWindowSeconds = Math.max(
      1,
      Math.round((Number(config.get('RATE_LIMIT_WINDOW_MS')) || 60_000) / 1000),
    );
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;

    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(SKIP_RATE_LIMIT_KEY, targets)) {
      return true;
    }

    const http = context.switchToHttp();
    const request = http.getRequest();
    const response = http.getResponse();
    const ip: string = request.ip || request.socket?.remoteAddress || 'unknown';

    const global = await this.limiter.hit(
      `ip:global:${ip}`,
      this.defaultLimit,
      this.defaultWindowSeconds,
    );
    if (!global.allowed) tooManyRequests(global, response);

    const route = this.reflector.getAllAndOverride<RateLimitOptions>(RATE_LIMIT_KEY, targets);
    if (route && route.scope !== 'user') {
      const name = `${context.getClass().name}.${context.getHandler().name}`;
      const result = await this.limiter.hit(`ip:${name}:${ip}`, route.limit, route.windowSeconds);
      if (!result.allowed) tooManyRequests(result, response);
    }

    return true;
  }
}
