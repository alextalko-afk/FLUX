import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { NotificationsController } from './notifications.controller';
import { MobilePushService } from './mobile-push.service';
import { NotificationsService } from './notifications.service';
import { PushProcessor } from './push.processor';
import { PUSH_QUEUE } from './push.queue';

@Module({
  imports: [BullModule.registerQueue({ name: PUSH_QUEUE })],
  controllers: [NotificationsController],
  providers: [NotificationsService, MobilePushService, PushProcessor],
  exports: [NotificationsService],
})
export class NotificationsModule {}
