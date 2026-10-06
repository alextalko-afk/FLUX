import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { StoriesService } from './stories.service';
import { CreateStoryDto } from './stories.dto';

@Controller('stories')
@UseGuards(JwtAuthGuard)
export class StoriesController {
  constructor(private readonly stories: StoriesService) {}

  @Post()
  create(@CurrentUser('id') userId: string, @Body() dto: CreateStoryDto) {
    return this.stories.create(userId, dto);
  }

  @Get()
  feed(@CurrentUser('id') userId: string) {
    return this.stories.feed(userId);
  }

  @Post(':id/view')
  @HttpCode(HttpStatus.OK)
  view(@CurrentUser('id') userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.stories.markViewed(userId, id);
  }

  @Get(':id/viewers')
  viewers(@CurrentUser('id') userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.stories.viewers(userId, id);
  }

  @Delete(':id')
  remove(@CurrentUser('id') userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.stories.remove(userId, id);
  }
}
