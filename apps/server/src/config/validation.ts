import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().regex(/^\d+$/).optional().default('3000'),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url().optional(),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  S3_ENDPOINT: z.string().url().optional(),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),
});

export function validate(config: Record<string, unknown>) {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    const errors = result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('\n');
    throw new Error(`Invalid environment variables:\n${errors}`);
  }
  // `@nestjs/config` copies only what `validate` returns into `process.env`, and
  // zod drops keys the schema does not list. Returning just `result.data` would
  // hide every other setting (SMTP_*, REDIS_*, S3_BUCKET_*, VAPID_*, TURN_*, ...)
  // from the rest of the app, so the validated values are layered over the full set.
  return { ...config, ...result.data };
}
