import { beforeAll, afterAll } from 'vitest';

/**
 * Global test setup for VyaparNet API tests.
 *
 * Sprint 0: Minimal setup.
 * Sprint 1+: Add DB seeding, auth token generation utilities.
 */

// Set required env vars for tests before app module is loaded
process.env.DATABASE_URL =
  'postgresql://vyaparnet:localdev@localhost:5433/vyaparnet';
process.env.REDIS_HOST = 'localhost';
process.env.REDIS_PORT = '6379';

beforeAll(async () => {
  // Verify test environment
  if (process.env['NODE_ENV'] !== 'test') {
    throw new Error('Tests must run with NODE_ENV=test');
  }
});

afterAll(async () => {
  // Cleanup placeholder for Sprint 1+
  // Sprint 1: Close Prisma connections
  // Sprint 1: Flush Redis test keys
});
