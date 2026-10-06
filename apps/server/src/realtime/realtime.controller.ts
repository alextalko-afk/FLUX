import { Controller, Get, HttpCode, Post, Query, Req, UseGuards } from '@nestjs/common';
import { IRealtimeSyncResponse } from '@FLUX/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { parsePositiveInt } from '../common/utils/parse-query';
import { RealtimeEventLogService } from './realtime-event-log.service';
import { WsTicketService } from './ws-ticket.service';
import { RateLimit } from '../common/rate-limit/rate-limit.decorator';

@Controller('sync')
export class RealtimeController {
  constructor(
    private readonly eventLog: RealtimeEventLogService,
    private readonly tickets: WsTicketService,
  ) {}

  /** A one-time ticket for opening the WebSocket; see WsTicketService. */
  @RateLimit({ limit: 30, windowSeconds: 60, scope: 'user' })
  @UseGuards(JwtAuthGuard)
  @Post('ticket')
  @HttpCode(200)
  async ticket(@Req() req: any) {
    return this.tickets.issue(req.user.id, req.user.sessionId);
  }

  /**
   * Replays the realtime events a client missed while it was disconnected.
   * `after` is the last sequence id the client applied (0 for "none").
   */
  @UseGuards(JwtAuthGuard)
  @Get()
  async sync(
    @CurrentUser('id') userId: string,
    @Query('after') after?: string,
  ): Promise<IRealtimeSyncResponse> {
    return this.eventLog.since(userId, parsePositiveInt(after, 0, Number.MAX_SAFE_INTEGER));
  }
}
