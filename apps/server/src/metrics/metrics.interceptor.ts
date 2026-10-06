import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';
import { MetricsService } from './metrics.service';

/** Counts and times every HTTP request, labelled by route pattern (never by the raw URL, which has ids in it). */
@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    const started = process.hrtime.bigint();

    const record = (status: number) => {
      const route = (req.route?.path as string | undefined) ?? 'unmatched';
      const seconds = Number(process.hrtime.bigint() - started) / 1e9;
      this.metrics.httpRequests.inc({ method: req.method, route, status: String(status) });
      this.metrics.httpDuration.observe({ method: req.method, route }, seconds);
    };

    return next.handle().pipe(
      tap({
        next: () => record(res.statusCode),
        error: (err) => record(typeof err?.getStatus === 'function' ? err.getStatus() : 500),
      }),
    );
  }
}
