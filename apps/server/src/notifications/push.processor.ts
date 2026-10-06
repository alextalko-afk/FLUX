import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { NotificationsService } from './notifications.service';
import { PUSH_QUEUE, PushJob } from './push.queue';

/** Worker of the `push` queue: hands each job to the service, a thrown error means "retry". */
@Processor(PUSH_QUEUE, { concurrency: 5 })
export class PushProcessor extends WorkerHost {
  constructor(private readonly notifications: NotificationsService) {
    super();
  }

  async process(job: Job<PushJob>): Promise<void> {
    await this.notifications.deliver(job.data);
  }
}
