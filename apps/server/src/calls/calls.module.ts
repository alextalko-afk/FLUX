import { Module } from '@nestjs/common';
import { CallsController } from './calls.controller';
import { CallsService } from './calls.service';
import { GroupCallsController } from './group-calls.controller';
import { GroupCallsService } from './group-calls.service';

@Module({
  // Signalling lives in the shared `RealtimeGateway` on `/ws`; there is no
  // second call socket to register.
  controllers: [CallsController, GroupCallsController],
  providers: [CallsService, GroupCallsService],
  exports: [CallsService],
})
export class CallsModule {}
