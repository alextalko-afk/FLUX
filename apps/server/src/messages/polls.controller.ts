import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { MessagesService } from './messages.service';
import { PollsService } from './polls.service';
import { CreatePollDto, VotePollDto } from './dto/polls.dto';

@Controller()
@UseGuards(JwtAuthGuard)
export class PollsController {
  constructor(
    private readonly polls: PollsService,
    private readonly messages: MessagesService,
  ) {}

  @Post('chats/:chatId/polls')
  async create(
    @CurrentUser('id') userId: string,
    @Param('chatId', ParseUUIDPipe) chatId: string,
    @Body() dto: CreatePollDto,
  ) {
    await this.messages.assertCanPost(userId, chatId);
    return this.polls.create(userId, chatId, dto);
  }

  @Post('polls/:pollId/vote')
  @HttpCode(HttpStatus.OK)
  vote(@CurrentUser('id') userId: string, @Param('pollId', ParseUUIDPipe) id: string, @Body() dto: VotePollDto) {
    return this.polls.vote(userId, id, dto.optionIds);
  }

  @Delete('polls/:pollId/vote')
  retract(@CurrentUser('id') userId: string, @Param('pollId', ParseUUIDPipe) id: string) {
    return this.polls.retract(userId, id);
  }

  @Post('polls/:pollId/close')
  @HttpCode(HttpStatus.OK)
  close(@CurrentUser('id') userId: string, @Param('pollId', ParseUUIDPipe) id: string) {
    return this.polls.close(userId, id);
  }

  @Get('polls/:pollId/voters')
  voters(@CurrentUser('id') userId: string, @Param('pollId', ParseUUIDPipe) id: string) {
    return this.polls.voters(userId, id);
  }
}
