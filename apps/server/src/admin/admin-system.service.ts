import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { BOT_WEBHOOK_QUEUE } from '../bots/bot-webhooks.service';
import { PUSH_QUEUE } from '../notifications/push.queue';
import { AuditService } from '../audit/audit.service';
import { SettingsService } from '../settings/settings.service';

const FAILED_LIMIT = 20;

/** Runtime settings and background queues, as seen from the admin panel. */
@Injectable()
export class AdminSystemService {
  private readonly queues: Record<string, Queue>;

  constructor(
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
    @InjectQueue(PUSH_QUEUE) push: Queue,
    @InjectQueue(BOT_WEBHOOK_QUEUE) botWebhooks: Queue,
  ) {
    this.queues = { [PUSH_QUEUE]: push, [BOT_WEBHOOK_QUEUE]: botWebhooks };
  }

  async listSettings() {
    return { items: await this.settings.all() };
  }

  async updateSettings(adminId: string, patch: Record<string, unknown>) {
    const result = await this.settings.update(adminId, patch);
    await this.audit.log(adminId, 'settings.update', undefined, result.changed);
    return { items: await this.settings.all() };
  }

  private queue(name: string): Queue {
    const queue = this.queues[name];
    if (!queue) throw new NotFoundException({ message: 'Unknown queue.', code: 'QUEUE_UNKNOWN' });
    return queue;
  }

  /** Job counts per queue; shared with the metrics endpoint. */
  async queueCounts() {
    return Promise.all(
      Object.entries(this.queues).map(async ([name, queue]) => ({
        name,
        counts: await queue.getJobCounts('waiting', 'active', 'delayed', 'completed', 'failed'),
      })),
    );
  }

  /** The newest failures with their reason; job data is left out because it carries message text. */
  async failedJobs(name: string) {
    const jobs = await this.queue(name).getFailed(0, FAILED_LIMIT - 1);
    return {
      items: jobs.map((j) => ({
        id: j.id,
        name: j.name,
        attemptsMade: j.attemptsMade,
        failedReason: j.failedReason,
        failedAt: j.finishedOn ? new Date(j.finishedOn).toISOString() : null,
      })),
    };
  }

  async retryFailed(adminId: string, name: string) {
    const queue = this.queue(name);
    const failed = await queue.getFailedCount();
    await queue.retryJobs({ state: 'failed' });
    await this.audit.log(adminId, 'queue.retry', name, { failed });
    return { retried: failed };
  }

  async cleanFailed(adminId: string, name: string) {
    const removed = await this.queue(name).clean(0, 1000, 'failed');
    await this.audit.log(adminId, 'queue.clean', name, { removed: removed.length });
    return { removed: removed.length };
  }
}
