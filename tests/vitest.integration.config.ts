import { defineConfig } from 'vitest/config';

/**
 * Integration test configuration.
 *
 * These tests talk to a real PostgreSQL instance using the generated Prisma
 * client, so they require the Docker services to be up
 * (`pnpm docker:up`) and the schema to be migrated
 * (`pnpm prisma:deploy`). They are kept out of `pnpm test` on purpose.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['integration/**/*.test.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
    fileParallelism: false,
  },
});
