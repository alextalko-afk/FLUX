import { RateLimit } from '../common/rate-limit/rate-limit.decorator';
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { SearchService } from './search.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { parsePositiveInt } from '../common/utils/parse-query';
import {
  GlobalSearchQueryDto,
  ChatSearchQueryDto,
  MessageSearchQueryDto,
} from './dto/search.dto';

@RateLimit({ limit: 60, windowSeconds: 60, scope: 'user' })
@Controller('search')
@UseGuards(JwtAuthGuard)
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  async global(
    @CurrentUser('id') userId: string,
    @Query() query: GlobalSearchQueryDto,
  ) {
    return this.searchService.globalSearch(userId, query);
  }

  @Get('users')
  async users(@Query('q') q: string, @Query('limit') limit?: string) {
    const normalizedQuery = typeof q === 'string' ? q.trim().replace(/^@/, '') : '';
    if (normalizedQuery.length === 0) {
      return [];
    }
    return this.searchService.searchUsers(
      normalizedQuery,
      parsePositiveInt(limit, 20, 50),
    );
  }

  @Get('chats')
  async chats(
    @CurrentUser('id') userId: string,
    @Query() query: ChatSearchQueryDto,
  ) {
    return this.searchService.searchChats(userId, query);
  }

  @Get('messages')
  async messages(
    @CurrentUser('id') userId: string,
    @Query() query: MessageSearchQueryDto,
  ) {
    return this.searchService.searchMessages(userId, query);
  }
}
