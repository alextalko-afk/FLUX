import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';

@Module({
  // PrismaModule and RedisModule are @Global but we import them explicitly so
  // this module stays self-contained and does not create duplicate clients.
  imports: [TerminusModule, PrismaModule, RedisModule],
  controllers: [HealthController],
})
export class HealthModule {}
