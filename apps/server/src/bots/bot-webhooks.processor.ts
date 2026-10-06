import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import {
  BOT_WEBHOOK_QUEUE,
  BotWebhookJobData,
} from './bot-webhooks.service';
import { webhookSignatureHeader } from './bot-webhooks.sign';

/**
 * Delivers queued bot webhook updates.
 *
 * Each job targets exactly one webhook. A non-2xx response (or a timeout)
 * throws, which lets BullMQ apply the job's retry/backoff policy. The exact
 * JSON body queued at dispatch time is reused for signing so the receiver's
 * HMAC recomputation matches byte-for-byte.
 */
@Processor(BOT_WEBHOOK_QUEUE)
export class BotWebhookProcessor extends WorkerHost {
  private readonly logger = new Logger(BotWebhookProcessor.name);
  private readonly TIMEOUT_MS = 8000;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<BotWebhookJobData>): Promise<void> {
    const { webhookId, event, body } = job.data;

    const webhook = await this.prisma.botWebhook.findUnique({
      where: { id: webhookId },
      include: { bot: { select: { isActive: true } } },
    });

    // The webhook may have been deleted or disabled between queueing and
    // delivery; treat that as a successful no-op rather than retrying forever.
    if (!webhook || !webhook.isActive || !webhook.bot.isActive) {
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.TIMEOUT_MS);

    try {
      const response = await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-FLUX-Event': event,
          'X-FLUX-Signature': webhookSignatureHeader(webhook.secret, body),
        },
        body,
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Webhook responded with ${response.status}`);
      }
    } finally {
      clearTimeout(timer);
    }
  }
}
