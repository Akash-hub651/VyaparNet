import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./test/setup.ts'],
    include: ['src/**/*.spec.ts', 'test/**/*.spec.ts'],
    exclude: ['node_modules', 'dist'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.module.ts',
        'src/**/*.spec.ts',
        'src/main.ts',
      ],
      thresholds: {
        // Sprint 0: No business logic, lower threshold acceptable
        // Sprint 1+: Must meet 70% threshold for domain code
        lines: 50,
        functions: 50,
        branches: 50,
        statements: 50,
      },
    },
  },
  resolve: {
    alias: {
      '@core': resolve(__dirname, './src/core'),
      '@shared': resolve(__dirname, './src/shared'),
      '@modules': resolve(__dirname, './src/modules'),
    },
  },
});
