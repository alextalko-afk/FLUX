import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { GroupCallsService, StartGroupCallDto } from './group-calls.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class GroupCallsController {
  constructor(private readonly calls: GroupCallsService) {}

  @Get('chats/:chatId/group-call')
  current(@CurrentUser('id') userId: string, @Param('chatId', ParseUUIDPipe) chatId: string) {
    return this.calls.current(userId, chatId);
  }

  @Post('chats/:chatId/group-call')
  @HttpCode(HttpStatus.OK)
  start(@CurrentUser('id') userId: string, @Param('chatId', ParseUUIDPipe) chatId: string, @Body() dto: StartGroupCallDto) {
    return this.calls.start(userId, chatId, dto.withVideo);
  }

  @Post('group-calls/:id/join')
  @HttpCode(HttpStatus.OK)
  join(@CurrentUser('id') userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.calls.join(userId, id);
  }

  @Post('group-calls/:id/leave')
  @HttpCode(HttpStatus.OK)
  leave(@CurrentUser('id') userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.calls.leave(userId, id);
  }

  @Post('group-calls/:id/end')
  @HttpCode(HttpStatus.OK)
  end(@CurrentUser('id') userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.calls.end(userId, id);
  }
}
