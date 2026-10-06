import { SkipRateLimit } from '../common/rate-limit/rate-limit.decorator';
import { Controller, Get } from '@nestjs/common';
import { HealthCheckService, HealthCheck, PrismaHealthIndicator, HealthCheckResult } from '@nestjs/terminus';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

@SkipRateLimit()
@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private prismaHealth: PrismaHealthIndicator,
    private prismaService: PrismaService,
    private redisService: RedisService,
  ) {}

  @Get()
  @HealthCheck()
  check(): Promise<HealthCheckResult> {
    return this.health.check([
      () => this.prismaHealth.pingCheck('database', this.prismaService),
      async () => {
        const isHealthy = await this.redisService.getClient().ping();
        return {
          redis: {
            status: isHealthy === 'PONG' ? 'up' : 'down',
          },
        };
      },
    ]);
  }
}
