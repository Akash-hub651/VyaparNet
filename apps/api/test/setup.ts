import { beforeAll, afterAll } from 'vitest';

/**
 * Global test setup for VyaparNet API tests.
 *
 * Sprint 0: Minimal setup.
 * Sprint 1+: Add DB seeding, auth token generation utilities.
 */

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
