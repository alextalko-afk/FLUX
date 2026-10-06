import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { IsString, MaxLength } from 'class-validator';
import { RateLimit } from '../common/rate-limit/rate-limit.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { LinkPreviewService } from './link-preview.service';

class LinkPreviewQueryDto {
  @IsString()
  @MaxLength(2048)
  url!: string;
}

@RateLimit({ limit: 30, windowSeconds: 60, scope: 'user' })
@Controller('link-preview')
@UseGuards(JwtAuthGuard)
export class LinkPreviewController {
  constructor(private readonly service: LinkPreviewService) {}

  @Get()
  async get(@Query() query: LinkPreviewQueryDto) {
    return { preview: await this.service.preview(query.url) };
  }
}
