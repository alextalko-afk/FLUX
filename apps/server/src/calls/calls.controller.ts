import { RateLimit } from '../common/rate-limit/rate-limit.decorator';
import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CallsService } from './calls.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { InitiateCallDto, CallHistoryQueryDto } from './dto/calls.dto';

@Controller('calls')
@UseGuards(JwtAuthGuard)
export class CallsController {
  constructor(private readonly callsService: CallsService) {}

  @RateLimit({ limit: 10, windowSeconds: 60, scope: 'user' })
  @Post('initiate')
  async initiate(
    @CurrentUser('id') userId: string,
    @Body() dto: InitiateCallDto,
  ) {
    return this.callsService.initiate(userId, dto);
  }

  @Post('accept')
  async accept(
    @CurrentUser('id') userId: string,
    @Body('callId') callId: string,
  ) {
    return this.callsService.accept(userId, callId);
  }

  @Post('reject')
  async reject(
    @CurrentUser('id') userId: string,
    @Body('callId') callId: string,
  ) {
    return this.callsService.reject(userId, callId);
  }

  @Post('end')
  async end(
    @CurrentUser('id') userId: string,
    @Body('callId') callId: string,
  ) {
    return this.callsService.end(userId, callId);
  }

  @Get('history')
  async history(
    @CurrentUser('id') userId: string,
    @Query() query: CallHistoryQueryDto,
  ) {
    return this.callsService.getHistory(userId, query);
  }
}
