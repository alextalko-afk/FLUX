import { defineConfig } from 'vitest/config';

/**
 * Unit test configuration.
 *
 * These tests must run with no external services: no PostgreSQL, no Redis, no
 * S3. They cover pure logic (parsers, CSRF token handling, shared contracts),
 * so `pnpm test` stays fast and usable on a fresh checkout and in CI before any
 * infrastructure is started.
 *
 * Tests that need a database live under `integration/` and are run separately
 * via `pnpm --filter @FLUX/tests run test:integration`.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['unit/**/*.test.ts'],
    testTimeout: 10000,
  },
});
