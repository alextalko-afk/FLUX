import { RateLimit } from '../common/rate-limit/rate-limit.decorator';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { MessagesService } from './messages.service';
import { PinsService } from './pins.service';
import { ScheduledMessagesService } from './scheduled.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import {
  SendMessageDto,
  EditMessageDto,
  ForwardMessageDto,
  MarkReadDto,
  MessageHistoryQueryDto,
  ReactDto,
  ScheduleMessageDto,
} from './dto/messages.dto';

@Controller('chats/:chatId/messages')
@UseGuards(JwtAuthGuard)
export class MessagesController {
  constructor(
    private readonly messagesService: MessagesService,
    private readonly pinsService: PinsService,
    private readonly scheduled: ScheduledMessagesService,
  ) {}

  @Get()
  async history(
    @CurrentUser('id') userId: string,
    @Param('chatId', ParseUUIDPipe) chatId: string,
    @Query() query: MessageHistoryQueryDto,
  ) {
    return this.messagesService.getHistory(userId, chatId, query);
  }

  @Get('scheduled')
  async listScheduled(
    @CurrentUser('id') userId: string,
    @Param('chatId', ParseUUIDPipe) chatId: string,
  ) {
    return this.scheduled.list(userId, chatId);
  }

  @RateLimit({ limit: 30, windowSeconds: 10, scope: 'user' })
  @Post('scheduled')
  async schedule(
    @CurrentUser('id') userId: string,
    @Param('chatId', ParseUUIDPipe) chatId: string,
    @Body() dto: ScheduleMessageDto,
  ) {
    return this.scheduled.schedule(userId, chatId, dto);
  }

  @Delete('scheduled/:id')
  async cancelScheduled(
    @CurrentUser('id') userId: string,
    @Param('chatId', ParseUUIDPipe) chatId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.scheduled.cancel(userId, chatId, id);
  }

  /** Pinned messages of the chat, newest pin first. */
  @Get('pinned')
  async pinned(
    @CurrentUser('id') userId: string,
    @Param('chatId', ParseUUIDPipe) chatId: string,
  ) {
    return this.pinsService.list(userId, chatId);
  }

  @RateLimit({ limit: 30, windowSeconds: 10, scope: 'user' })
  @Post(':messageId/pin')
  @HttpCode(HttpStatus.OK)
  async pin(
    @CurrentUser('id') userId: string,
    @Param('chatId', ParseUUIDPipe) chatId: string,
    @Param('messageId', ParseUUIDPipe) messageId: string,
  ) {
    return this.pinsService.pin(userId, chatId, messageId);
  }

  @RateLimit({ limit: 30, windowSeconds: 10, scope: 'user' })
  @Delete(':messageId/pin')
  async unpin(
    @CurrentUser('id') userId: string,
    @Param('chatId', ParseUUIDPipe) chatId: string,
    @Param('messageId', ParseUUIDPipe) messageId: string,
  ) {
    return this.pinsService.unpin(userId, chatId, messageId);
  }

  @RateLimit({ limit: 30, windowSeconds: 10, scope: 'user' })
  @Post()
  async send(
    @CurrentUser('id') userId: string,
    @Param('chatId', ParseUUIDPipe) chatId: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.messagesService.sendMessage(userId, chatId, dto);
  }

  @RateLimit({ limit: 30, windowSeconds: 10, scope: 'user' })
  @Post(':messageId/edit')
  async edit(
    @CurrentUser('id') userId: string,
    @Param('chatId', ParseUUIDPipe) chatId: string,
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @Body() dto: EditMessageDto,
  ) {
    return this.messagesService.editMessage(userId, chatId, messageId, dto);
  }

  @Delete(':messageId')
  async delete(
    @CurrentUser('id') userId: string,
    @Param('chatId', ParseUUIDPipe) chatId: string,
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @Query('forAll') forAll?: string,
  ) {
    return this.messagesService.deleteMessage(userId, chatId, messageId, forAll === 'true');
  }

  @RateLimit({ limit: 20, windowSeconds: 10, scope: 'user' })
  @Post(':messageId/forward')
  async forward(
    @CurrentUser('id') userId: string,
    @Param('chatId', ParseUUIDPipe) chatId: string,
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @Body() dto: ForwardMessageDto,
  ) {
    return this.messagesService.forwardMessage(userId, chatId, messageId, dto);
  }

  @RateLimit({ limit: 60, windowSeconds: 10, scope: 'user' })
  @Post('read')
  @HttpCode(HttpStatus.OK)
  async markRead(
    @CurrentUser('id') userId: string,
    @Param('chatId', ParseUUIDPipe) chatId: string,
    @Body() dto: MarkReadDto,
  ) {
    return this.messagesService.markRead(userId, chatId, dto);
  }

  @RateLimit({ limit: 60, windowSeconds: 10, scope: 'user' })
  @Post(':messageId/react')
  async react(
    @CurrentUser('id') userId: string,
    @Param('chatId', ParseUUIDPipe) chatId: string,
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @Body() dto: ReactDto,
  ) {
    return this.messagesService.react(userId, chatId, messageId, dto);
  }
}
