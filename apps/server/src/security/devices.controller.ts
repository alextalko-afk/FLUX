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
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RateLimit } from '../common/rate-limit/rate-limit.decorator';
import { DevicesService } from './devices.service';
import { RegisterDeviceDto } from './dto/device.dto';

@Controller('security/devices')
@UseGuards(JwtAuthGuard)
export class DevicesController {
  constructor(private readonly devicesService: DevicesService) {}

  /** Registers this device's public key for secret chats (idempotent). */
  @RateLimit({ limit: 20, windowSeconds: 3600, scope: 'user' })
  @Post()
  @HttpCode(HttpStatus.OK)
  async register(@CurrentUser('id') userId: string, @Body() dto: RegisterDeviceDto) {
    return this.devicesService.register(userId, dto);
  }

  @Get()
  async list(@CurrentUser('id') userId: string) {
    return this.devicesService.list(userId);
  }

  @RateLimit({ limit: 20, windowSeconds: 3600, scope: 'user' })
  @Delete(':id')
  async revoke(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) deviceKeyId: string,
  ) {
    return this.devicesService.revoke(userId, deviceKeyId);
  }
}
