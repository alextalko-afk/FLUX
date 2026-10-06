import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { RATE_LIMIT_KEY, RateLimitOptions } from './rate-limit.decorator';
import { tooManyRequests } from './rate-limit.guard';
import { RateLimitService } from './rate-limit.service';

/**
 * Enforces `@RateLimit({ scope: 'user' })`. Interceptors run after guards, so
 * `request.user` is already the authenticated account here and cannot be
 * spoofed by the caller the way an unverified token claim could.
 */
@Injectable()
export class UserRateLimitInterceptor implements NestInterceptor {
  constructor(
    private readonly limiter: RateLimitService,
    private readonly reflector: Reflector,
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    if (context.getType() !== 'http') return next.handle();

    const options = this.reflector.getAllAndOverride<RateLimitOptions>(RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!options || options.scope !== 'user') return next.handle();

    const http = context.switchToHttp();
    const userId: string | undefined = http.getRequest().user?.id;
    if (!userId) return next.handle();

    const name = `${context.getClass().name}.${context.getHandler().name}`;
    const result = await this.limiter.hit(
      `user:${name}:${userId}`,
      options.limit,
      options.windowSeconds,
    );
    if (!result.allowed) tooManyRequests(result, http.getResponse());

    return next.handle();
  }
}
