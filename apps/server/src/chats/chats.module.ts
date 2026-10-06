import { MediaSummaryController } from './media-summary.controller';
import { GroupE2eeController } from './group-e2ee.controller';
import { GroupE2eeService } from './group-e2ee.service';
import { ChatExportController } from './export.controller';
import { Module } from '@nestjs/common';
import { ChatsController } from './chats.controller';
import { ChatsService } from './chats.service';
import { InvitesService } from './invites.service';
import { AdminLogService } from './admin-log.service';
import { ChannelStatsController, ChannelStatsService } from './channel-stats.service';
import { TopicsController } from './topics.controller';
import { TopicsService } from './topics.service';
import { FoldersController } from './folders.controller';
import { FoldersService } from './folders.service';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [RealtimeModule],
  controllers: [MediaSummaryController, GroupE2eeController, ChatExportController, ChatsController, FoldersController, TopicsController, ChannelStatsController],
  providers: [GroupE2eeService, ChatsService, InvitesService, FoldersService, AdminLogService, TopicsService, ChannelStatsService],
  exports: [ChatsService, InvitesService],
})
export class ChatsModule {}
