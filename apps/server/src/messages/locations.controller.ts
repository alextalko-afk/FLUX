import { Body, Controller, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { MessagesService } from './messages.service';
import { LocationsService, ShareLocationDto, UpdateLocationDto } from './locations.service';

@Controller('chats/:chatId')
@UseGuards(JwtAuthGuard)
export class LocationsController {
  constructor(
    private readonly locations: LocationsService,
    private readonly messages: MessagesService,
  ) {}

  @Post('location')
  async share(
    @CurrentUser('id') userId: string,
    @Param('chatId', ParseUUIDPipe) chatId: string,
    @Body() dto: ShareLocationDto,
  ) {
    await this.messages.assertCanPost(userId, chatId);
    return this.locations.share(userId, chatId, dto);
  }

  @Post('messages/:messageId/location')
  @HttpCode(HttpStatus.OK)
  update(
    @CurrentUser('id') userId: string,
    @Param('chatId', ParseUUIDPipe) chatId: string,
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @Body() dto: UpdateLocationDto,
  ) {
    return this.locations.update(userId, chatId, messageId, dto);
  }

  @Post('messages/:messageId/location/stop')
  @HttpCode(HttpStatus.OK)
  stop(
    @CurrentUser('id') userId: string,
    @Param('chatId', ParseUUIDPipe) chatId: string,
    @Param('messageId', ParseUUIDPipe) messageId: string,
  ) {
    return this.locations.stop(userId, chatId, messageId);
  }
}
