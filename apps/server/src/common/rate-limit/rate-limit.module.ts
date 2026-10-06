import { Global, Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { RateLimitGuard } from './rate-limit.guard';
import { RateLimitService } from './rate-limit.service';
import { UserRateLimitInterceptor } from './user-rate-limit.interceptor';

@Global()
@Module({
  providers: [
    RateLimitService,
    { provide: APP_GUARD, useClass: RateLimitGuard },
    { provide: APP_INTERCEPTOR, useClass: UserRateLimitInterceptor },
  ],
  exports: [RateLimitService],
})
export class RateLimitModule {}
