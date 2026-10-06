import { AdminTwoFactorGuard } from './admin-two-factor.guard';
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AdminSystemService } from './admin-system.service';
import { BOT_WEBHOOK_QUEUE } from '../bots/bot-webhooks.service';
import { PUSH_QUEUE } from '../notifications/push.queue';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule, BullModule.registerQueue({ name: PUSH_QUEUE }, { name: BOT_WEBHOOK_QUEUE })],
  controllers: [AdminController],
  providers: [AdminService, AdminSystemService, AdminTwoFactorGuard],
  exports: [AdminService, AdminSystemService],
})
export class AdminModule {}
