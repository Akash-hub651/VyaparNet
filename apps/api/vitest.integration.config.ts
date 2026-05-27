import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

/**
 * Integration test configuration for VyaparNet API.
 *
 * Runs tests that require live infrastructure (PostgreSQL, Redis).
 * Sprint 0: No integration tests yet — passWithNoTests prevents CI failures.
 * Sprint 1+: Add real DB-backed tests under test/integration/.
 *
 * Authority: VyaparNet_Implementation_Architecture_Official_Freeze_v1.md Section 21
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./test/setup.ts'],
    // Integration tests live in test/integration/ (Sprint 1+)
    include: ['test/integration/**/*.spec.ts'],
    exclude: ['node_modules', 'dist'],
    fileParallelism: false,
    // Allow zero tests — Sprint 0 has no integration test files yet
    passWithNoTests: true,
    // Integration tests may wait for DB migrations and seeding
    testTimeout: 60000,
    hookTimeout: 30000,
    // Run tests sequentially to prevent DB conflicts
    fileParallelism: false,
  },
  resolve: {
    alias: {
      '@core': resolve(__dirname, './src/core'),
      '@shared': resolve(__dirname, './src/shared'),
      '@modules': resolve(__dirname, './src/modules'),
    },
  },
});
