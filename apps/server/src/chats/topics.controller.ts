import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateTopicDto, TopicsService, UpdateTopicDto } from './topics.service';

@Controller('chats/:chatId/topics')
@UseGuards(JwtAuthGuard)
export class TopicsController {
  constructor(private readonly topics: TopicsService) {}

  @Get()
  list(@CurrentUser('id') userId: string, @Param('chatId', ParseUUIDPipe) chatId: string) {
    return this.topics.list(userId, chatId);
  }

  @Post()
  create(@CurrentUser('id') userId: string, @Param('chatId', ParseUUIDPipe) chatId: string, @Body() dto: CreateTopicDto) {
    return this.topics.create(userId, chatId, dto);
  }

  @Patch(':topicId')
  update(
    @CurrentUser('id') userId: string,
    @Param('chatId', ParseUUIDPipe) chatId: string,
    @Param('topicId', ParseUUIDPipe) topicId: string,
    @Body() dto: UpdateTopicDto,
  ) {
    return this.topics.update(userId, chatId, topicId, dto);
  }

  @Delete(':topicId')
  remove(
    @CurrentUser('id') userId: string,
    @Param('chatId', ParseUUIDPipe) chatId: string,
    @Param('topicId', ParseUUIDPipe) topicId: string,
  ) {
    return this.topics.remove(userId, chatId, topicId);
  }
}
