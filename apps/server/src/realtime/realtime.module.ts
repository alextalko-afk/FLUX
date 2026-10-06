import { WsTicketService } from './ws-ticket.service';
import { Global, Module } from '@nestjs/common';
import { RealtimeGateway } from './realtime.gateway';
import { RealtimeController } from './realtime.controller';
import { RealtimeEventLogService } from './realtime-event-log.service';
import { AuthModule } from '../auth/auth.module';

@Global()
@Module({
  imports: [AuthModule],
  controllers: [RealtimeController],
  providers: [RealtimeGateway, RealtimeEventLogService, WsTicketService],
  exports: [RealtimeGateway, RealtimeEventLogService],
})
export class RealtimeModule {}
