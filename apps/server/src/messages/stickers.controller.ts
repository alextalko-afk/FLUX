import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { MessagesService } from './messages.service';
import { StickersService } from './stickers.service';
import { CreateStickerPackDto, SendStickerDto } from './dto/stickers.dto';

@Controller()
@UseGuards(JwtAuthGuard)
export class StickersController {
  constructor(
    private readonly stickers: StickersService,
    private readonly messages: MessagesService,
  ) {}

  @Post('stickers/packs')
  create(@CurrentUser('id') userId: string, @Body() dto: CreateStickerPackDto) {
    return this.stickers.createPack(userId, dto);
  }

  @Get('stickers/packs/mine')
  mine(@CurrentUser('id') userId: string) {
    return this.stickers.mine(userId);
  }

  @Get('stickers/packs')
  search(@Query('q') q = '') {
    return this.stickers.search(q);
  }

  @Get('stickers/packs/:id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.stickers.getPack(id);
  }

  @Post('stickers/packs/:id/install')
  @HttpCode(HttpStatus.OK)
  install(@CurrentUser('id') userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.stickers.install(userId, id);
  }

  @Delete('stickers/packs/:id/install')
  uninstall(@CurrentUser('id') userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.stickers.uninstall(userId, id);
  }

  @Delete('stickers/packs/:id')
  remove(@CurrentUser('id') userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.stickers.deletePack(userId, id);
  }

  @Post('chats/:chatId/stickers')
  async send(
    @CurrentUser('id') userId: string,
    @Param('chatId', ParseUUIDPipe) chatId: string,
    @Body() dto: SendStickerDto,
  ) {
    await this.messages.assertCanPost(userId, chatId);
    return this.stickers.send(userId, chatId, dto.stickerId, dto.replyToMessageId);
  }
}
