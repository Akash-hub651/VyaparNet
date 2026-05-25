/**
 * @vyaparnet/database
 * Single Prisma client export for all VyaparNet applications.
 * Never import PrismaClient directly from @prisma/client in apps.
 * Always import from @vyaparnet/database.
 */

import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

/**
 * Singleton PrismaClient.
 * In development, prevents hot-reload from creating multiple instances.
 * In production, always creates a single instance.
 */
export const prisma =
  globalThis.__prisma ??
  new PrismaClient({
    log: process.env['NODE_ENV'] === 'development'
      ? ['query', 'error', 'warn']
      : ['error'],
  });

if (process.env['NODE_ENV'] !== 'production') {
  globalThis.__prisma = prisma;
}

export * from '@prisma/client';
