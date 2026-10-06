export const PUSH_QUEUE = 'push';

/** One delivery to one target: a browser subscription or a phone token. */
export interface PushJob {
  kind: 'web' | 'mobile';
  targetId: string;
  /** JSON `{ title, body, data, timestamp }`, built once so retries send the same text. */
  payload: string;
}

export const PUSH_JOB_OPTIONS = {
  attempts: 4,
  backoff: { type: 'exponential' as const, delay: 3000 },
  removeOnComplete: 200,
  removeOnFail: 500,
};
