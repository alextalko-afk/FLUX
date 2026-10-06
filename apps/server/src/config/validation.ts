import { z } from 'zod';

// Hosted setups leave optional services blank; an empty or placeholder value ("-") means "not configured".
const unset = (v: unknown) => (typeof v === 'string' && ['', '-'].includes(v.trim()) ? undefined : v);

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().regex(/^\d+$/).optional().default('3000'),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.preprocess(unset, z.string().url().optional()),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  S3_ENDPOINT: z.preprocess(unset, z.string().url().optional()),
  S3_ACCESS_KEY: z.preprocess(unset, z.string().optional()),
  S3_SECRET_KEY: z.preprocess(unset, z.string().optional()),
});

const OPTIONAL_SERVICES = ['REDIS_URL', 'S3_ENDPOINT', 'S3_PUBLIC_ENDPOINT', 'S3_ACCESS_KEY', 'S3_SECRET_KEY'];

export function validate(config: Record<string, unknown>) {
  // The rest of the app reads process.env directly, so a placeholder must disappear from there too.
  for (const key of OPTIONAL_SERVICES) {
    if (unset(process.env[key]) === undefined) delete process.env[key];
    if (unset(config[key]) === undefined) delete config[key];
  }
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
