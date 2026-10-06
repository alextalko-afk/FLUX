import { Controller, Get, Header, Headers, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';
import { MetricsService } from './metrics.service';

/**
 * `GET /metrics` in the Prometheus text format. Off (404) until `METRICS_TOKEN` is set; scrapers send
 * it as `Authorization: Bearer <token>`.
 */
@Controller('metrics')
export class MetricsController {
  constructor(
    private readonly metrics: MetricsService,
    private readonly config: ConfigService,
  ) {}

  @Get()
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  async scrape(@Headers('authorization') authorization?: string): Promise<string> {
    const expected = this.config.get<string>('METRICS_TOKEN');
    if (!expected) throw new NotFoundException();

    const given = Buffer.from((authorization ?? '').replace(/^Bearer\s+/i, ''));
    const wanted = Buffer.from(expected);
    if (given.length !== wanted.length || !timingSafeEqual(given, wanted)) throw new UnauthorizedException();

    return this.metrics.render();
  }
}
