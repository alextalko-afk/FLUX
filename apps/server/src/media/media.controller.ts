import { RateLimit } from '../common/rate-limit/rate-limit.decorator';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { MediaService } from './media.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { InitUploadDto, CompleteUploadDto } from './dto/media.dto';

@Controller('media')
@UseGuards(JwtAuthGuard)
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @RateLimit({ limit: 30, windowSeconds: 60, scope: 'user' })
  @Post('upload/init')
  async initUpload(
    @CurrentUser('id') userId: string,
    @Body() dto: InitUploadDto,
  ) {
    return this.mediaService.initUpload(userId, dto);
  }

  @Post('upload/complete')
  @HttpCode(HttpStatus.OK)
  async completeUpload(
    @CurrentUser('id') userId: string,
    @Body() dto: CompleteUploadDto,
  ) {
    return this.mediaService.completeUpload(userId, dto);
  }

  @Get('download/:fileObjectId')
  async getDownloadUrl(
    @CurrentUser('id') userId: string,
    @Param('fileObjectId', ParseUUIDPipe) fileObjectId: string,
    @Query('thumb') thumb?: string,
  ) {
    return this.mediaService.getDownloadUrl(
      userId,
      fileObjectId,
      thumb === '1' || thumb === 'true' ? 'thumb' : 'original',
    );
  }
}
