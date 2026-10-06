import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import {
  RegisterDeviceDto,
  SubscribePushDto,
  UnregisterDeviceDto,
  UpdateNotificationSettingsDto,
} from './dto/notifications.dto';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get('vapid-public-key')
  getVapidPublicKey() {
    return { publicKey: this.notificationsService.getVapidPublicKey() };
  }

  @Post('subscribe')
  @HttpCode(HttpStatus.OK)
  async subscribe(
    @CurrentUser('id') userId: string,
    @Body() dto: SubscribePushDto,
  ) {
    return this.notificationsService.subscribe(userId, dto);
  }

  @Delete('unsubscribe')
  async unsubscribe(
    @CurrentUser('id') userId: string,
    @Body('endpoint') endpoint: string,
  ) {
    return this.notificationsService.unsubscribe(userId, endpoint);
  }

  @Get('devices')
  async listDevices(@CurrentUser('id') userId: string) {
    return this.notificationsService.listDevices(userId);
  }

  @Post('devices')
  @HttpCode(HttpStatus.OK)
  async registerDevice(@CurrentUser('id') userId: string, @Body() dto: RegisterDeviceDto) {
    return this.notificationsService.registerDevice(userId, dto);
  }

  @Delete('devices')
  async unregisterDevice(@CurrentUser('id') userId: string, @Body() dto: UnregisterDeviceDto) {
    return this.notificationsService.unregisterDevice(userId, dto.token);
  }

  @Get('settings')
  async getSettings(@CurrentUser('id') userId: string) {
    return this.notificationsService.getSettings(userId);
  }

  @Post('settings')
  @HttpCode(HttpStatus.OK)
  async updateSettings(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateNotificationSettingsDto,
  ) {
    return this.notificationsService.updateSettings(userId, dto);
  }
}
