import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CommentsQueryDto, CommentsService, CreateCommentDto } from './comments.service';

@Controller('chats/:chatId/messages/:messageId/comments')
@UseGuards(JwtAuthGuard)
export class CommentsController {
  constructor(private readonly comments: CommentsService) {}

  @Get()
  list(
    @CurrentUser('id') userId: string,
    @Param('chatId', ParseUUIDPipe) chatId: string,
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @Query() query: CommentsQueryDto,
  ) {
    return this.comments.list(userId, chatId, messageId, query.cursor);
  }

  @Post()
  create(
    @CurrentUser('id') userId: string,
    @Param('chatId', ParseUUIDPipe) chatId: string,
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @Body() dto: CreateCommentDto,
  ) {
    return this.comments.create(userId, chatId, messageId, dto.content);
  }

  @Delete(':commentId')
  remove(
    @CurrentUser('id') userId: string,
    @Param('chatId', ParseUUIDPipe) chatId: string,
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @Param('commentId', ParseUUIDPipe) commentId: string,
  ) {
    return this.comments.remove(userId, chatId, messageId, commentId);
  }
}
