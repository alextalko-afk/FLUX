import { Injectable } from '@nestjs/common';
import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';
import { RealtimeGateway } from '../realtime/realtime.gateway';

/** Prometheus metrics of this process: Node defaults plus the numbers that matter for FLUX. */
@Injectable()
export class MetricsService {
  readonly registry = new Registry();

  readonly httpRequests = new Counter({
    name: 'flux_http_requests_total',
    help: 'HTTP requests by method, route pattern and status.',
    labelNames: ['method', 'route', 'status'] as const,
    registers: [this.registry],
  });

  readonly httpDuration = new Histogram({
    name: 'flux_http_request_duration_seconds',
    help: 'HTTP request duration by method and route pattern.',
    labelNames: ['method', 'route'] as const,
    buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    registers: [this.registry],
  });

  readonly messagesSent = new Counter({
    name: 'flux_messages_sent_total',
    help: 'Messages sent, by type.',
    labelNames: ['type'] as const,
    registers: [this.registry],
  });

  constructor(realtime: RealtimeGateway) {
    collectDefaultMetrics({ register: this.registry, prefix: 'flux_' });

    new Gauge({
      name: 'flux_ws_connections',
      help: 'Open WebSocket connections.',
      registers: [this.registry],
      collect() {
        this.set(realtime.connectionCount());
      },
    });
    new Gauge({
      name: 'flux_ws_users_online',
      help: 'Users with at least one open WebSocket connection.',
      registers: [this.registry],
      collect() {
        this.set(realtime.onlineUserCount());
      },
    });
  }

  /** Registers a gauge whose value is read at scrape time (used for queue depths). */
  addGauge(name: string, help: string, labelNames: string[], read: () => Promise<{ labels: Record<string, string>; value: number }[]>) {
    new Gauge({
      name,
      help,
      labelNames,
      registers: [this.registry],
      async collect() {
        this.reset();
        for (const { labels, value } of await read()) this.set(labels, value);
      },
    });
  }

  render(): Promise<string> {
    return this.registry.metrics();
  }
}
