import { RateLimit } from '../common/rate-limit/rate-limit.decorator';
import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Patch,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { BotsService } from './bots.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { parsePositiveInt } from '../common/utils/parse-query';
import {
  CreateBotDto,
  CreateBotCommandDto,
  CreateBotWebhookDto,
  UpdateBotWebhookDto,
  BotCallbackDto,
  BotWebAppDto,
  BotCatalogQueryDto,
  UpdateBotDto,
  BotInlineQueryDto,
  BotSendMessageWithKeyboardDto,
  BotEditMessageDto,
  BotDeleteMessageDto,
} from './dto/bots.dto';
import { UserRole } from '@FLUX/shared';

@Controller('bots')
export class BotsController {
  constructor(private readonly botsService: BotsService) {}

  @UseGuards(JwtAuthGuard)
  @RateLimit({ limit: 60, windowSeconds: 60 })
  @Get('inline')
  async inline(@CurrentUser('id') userId: string, @Query() dto: BotInlineQueryDto) {
    return this.botsService.inlineQuery(userId, dto.bot, dto.q);
  }

  @UseGuards(JwtAuthGuard)
  @RateLimit({ limit: 30, windowSeconds: 60 })
  @Post('webapp')
  @HttpCode(HttpStatus.OK)
  async webApp(@CurrentUser('id') userId: string, @Body() dto: BotWebAppDto) {
    return this.botsService.webAppSession(userId, dto.messageId, dto.url);
  }

  @UseGuards(JwtAuthGuard)
  @RateLimit({ limit: 30, windowSeconds: 60 })
  @Post('callback')
  @HttpCode(HttpStatus.OK)
  async pressButton(@CurrentUser('id') userId: string, @Body() dto: BotCallbackDto) {
    return this.botsService.pressButton(userId, dto.messageId, dto.data);
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  async create(@CurrentUser('id') ownerId: string, @Body() dto: CreateBotDto) {
    return this.botsService.createBot(ownerId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('catalog')
  async catalog(@Query() dto: BotCatalogQueryDto) {
    return this.botsService.catalog(dto.q);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  async update(@CurrentUser('id') ownerId: string, @Param('id', ParseUUIDPipe) botId: string, @Body() dto: UpdateBotDto) {
    return this.botsService.updateBot(ownerId, botId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  async list(@CurrentUser('id') ownerId: string) {
    return this.botsService.listBots(ownerId);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  async get(
    @CurrentUser('id') ownerId: string,
    @Param('id', ParseUUIDPipe) botId: string,
  ) {
    return this.botsService.getBot(ownerId, botId);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  async delete(
    @CurrentUser('id') ownerId: string,
    @Param('id', ParseUUIDPipe) botId: string,
  ) {
    return this.botsService.deleteBot(ownerId, botId);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/regenerate-token')
  @HttpCode(HttpStatus.OK)
  async regenerateToken(
    @CurrentUser('id') ownerId: string,
    @Param('id', ParseUUIDPipe) botId: string,
  ) {
    return this.botsService.regenerateToken(ownerId, botId);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/commands')
  async addCommand(
    @CurrentUser('id') ownerId: string,
    @Param('id', ParseUUIDPipe) botId: string,
    @Body() dto: CreateBotCommandDto,
  ) {
    return this.botsService.addCommand(ownerId, botId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id/commands/:commandId')
  async removeCommand(
    @CurrentUser('id') ownerId: string,
    @Param('id', ParseUUIDPipe) botId: string,
    @Param('commandId', ParseUUIDPipe) commandId: string,
  ) {
    return this.botsService.removeCommand(ownerId, botId, commandId);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/webhooks')
  async addWebhook(
    @CurrentUser('id') ownerId: string,
    @Param('id', ParseUUIDPipe) botId: string,
    @Body() dto: CreateBotWebhookDto,
  ) {
    return this.botsService.addWebhook(ownerId, botId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Put(':id/webhooks/:webhookId')
  async updateWebhook(
    @CurrentUser('id') ownerId: string,
    @Param('id', ParseUUIDPipe) botId: string,
    @Param('webhookId', ParseUUIDPipe) webhookId: string,
    @Body() dto: UpdateBotWebhookDto,
  ) {
    return this.botsService.updateWebhook(ownerId, botId, webhookId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id/webhooks/:webhookId')
  async removeWebhook(
    @CurrentUser('id') ownerId: string,
    @Param('id', ParseUUIDPipe) botId: string,
    @Param('webhookId', ParseUUIDPipe) webhookId: string,
  ) {
    return this.botsService.removeWebhook(ownerId, botId, webhookId);
  }

  @RateLimit({ limit: 60, windowSeconds: 60 })
  @Post('api/sendMessage')
  @HttpCode(HttpStatus.OK)
  async sendMessage(
    @Headers('x-bot-token') token: string,
    @Body() dto: BotSendMessageWithKeyboardDto,
  ) {
    return this.botsService.sendMessageByToken(token, dto);
  }

  @RateLimit({ limit: 60, windowSeconds: 60 })
  @Post('api/editMessage')
  @HttpCode(HttpStatus.OK)
  async editMessage(
    @Headers('x-bot-token') token: string,
    @Body() dto: BotEditMessageDto,
  ) {
    return this.botsService.editMessageByToken(token, dto);
  }

  @RateLimit({ limit: 60, windowSeconds: 60 })
  @Post('api/deleteMessage')
  @HttpCode(HttpStatus.OK)
  async deleteMessage(
    @Headers('x-bot-token') token: string,
    @Body() dto: BotDeleteMessageDto,
  ) {
    return this.botsService.deleteMessageByToken(token, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('admin/all')
  async listAllForAdmin(
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.botsService.listAllBotsForAdmin(
      parsePositiveInt(limit, 100, 200),
      cursor,
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post('admin/:id/toggle')
  @HttpCode(HttpStatus.OK)
  async toggleForAdmin(
    @CurrentUser('id') adminId: string,
    @Param('id', ParseUUIDPipe) botId: string,
    @Body('isActive') isActive: boolean,
  ) {
    return this.botsService.toggleBotForAdmin(adminId, botId, isActive);
  }
}
