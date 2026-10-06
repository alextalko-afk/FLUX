import { Global, Module, OnModuleInit } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { BullModule } from '@nestjs/bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { BOT_WEBHOOK_QUEUE } from '../bots/bot-webhooks.service';
import { PUSH_QUEUE } from '../notifications/push.queue';
import { MetricsController } from './metrics.controller';
import { MetricsInterceptor } from './metrics.interceptor';
import { MetricsService } from './metrics.service';

@Global()
@Module({
  imports: [BullModule.registerQueue({ name: PUSH_QUEUE }, { name: BOT_WEBHOOK_QUEUE })],
  controllers: [MetricsController],
  providers: [MetricsService, { provide: APP_INTERCEPTOR, useClass: MetricsInterceptor }],
  exports: [MetricsService],
})
export class MetricsModule implements OnModuleInit {
  constructor(
    private readonly metrics: MetricsService,
    @InjectQueue(PUSH_QUEUE) private readonly push: Queue,
    @InjectQueue(BOT_WEBHOOK_QUEUE) private readonly bots: Queue,
  ) {}

  onModuleInit() {
    const queues: Record<string, Queue> = { [PUSH_QUEUE]: this.push, [BOT_WEBHOOK_QUEUE]: this.bots };
    this.metrics.addGauge('flux_queue_jobs', 'Jobs per queue and state.', ['queue', 'state'], async () => {
      const rows: { labels: Record<string, string>; value: number }[] = [];
      for (const [queue, q] of Object.entries(queues)) {
        const counts = await q.getJobCounts('waiting', 'active', 'delayed', 'failed');
        for (const [state, value] of Object.entries(counts)) rows.push({ labels: { queue, state }, value });
      }
      return rows;
    });
  }
}
