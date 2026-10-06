import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { BotsController } from './bots.controller';
import { BotsService } from './bots.service';
import {
  BOT_WEBHOOK_QUEUE,
  BotWebhookService,
} from './bot-webhooks.service';
import { BotWebhookProcessor } from './bot-webhooks.processor';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule, BullModule.registerQueue({ name: BOT_WEBHOOK_QUEUE })],
  controllers: [BotsController],
  providers: [BotsService, BotWebhookService, BotWebhookProcessor],
  exports: [BotsService, BotWebhookService],
})
export class BotsModule {}
