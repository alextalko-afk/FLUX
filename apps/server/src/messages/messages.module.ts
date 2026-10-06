import { Module } from '@nestjs/common';
import { MessagesController } from './messages.controller';
import { MessagesService } from './messages.service';
import { PinsService } from './pins.service';
import { LocationsController } from './locations.controller';
import { LocationsService } from './locations.service';
import { CommentsController } from './comments.controller';
import { CommentsService } from './comments.service';
import { PollsController } from './polls.controller';
import { PollsService } from './polls.service';
import { StickersController } from './stickers.controller';
import { StickersService } from './stickers.service';
import { ScheduledMessagesService } from './scheduled.service';
import { RealtimeModule } from '../realtime/realtime.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { BotsModule } from '../bots/bots.module';

@Module({
  imports: [RealtimeModule, NotificationsModule, BotsModule],
  controllers: [MessagesController, PollsController, StickersController, CommentsController, LocationsController],
  providers: [MessagesService, PollsService, StickersService, CommentsService, LocationsService, PinsService, ScheduledMessagesService],
  exports: [MessagesService, PinsService],
})
export class MessagesModule {}
