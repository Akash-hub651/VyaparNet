import { z } from 'zod';

/**
 * Environment variable validation schema.
 * Every variable used by the API must be declared here.
 * This prevents "undefined env var" bugs at startup.
 *
 * Authority: LOCKED_DECISIONS.md — secrets in env vars only
 */
export const configSchema = z.object({
  // Node
  NODE_ENV: z
    .enum(['development', 'test', 'staging', 'production'])
    .default('development'),

  // Application
  API_PORT: z.string().regex(/^\d+$/).default('3000').transform(Number),
  API_HOST: z.string().default('0.0.0.0'),

  // Database
  DATABASE_URL: z.string().url('DATABASE_URL must be a valid PostgreSQL URL'),

  // Redis
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.string().regex(/^\d+$/).default('6379').transform(Number),
  REDIS_PASSWORD: z.string().optional(),

  // CORS
  CORS_ORIGINS: z.string().default('http://localhost:3000'),

  // Rate limiting
  RATE_LIMIT_TTL_MS: z.string().default('60000').transform(Number),
  RATE_LIMIT_MAX: z.string().default('100').transform(Number),

  // BullMQ
  BULLMQ_CONCURRENCY: z.string().default('5').transform(Number),

  // MSG91
  MSG91_AUTH_KEY: z.string().optional(),
  MSG91_TEMPLATE_ID: z.string().optional(),
});

export type AppConfig = z.infer<typeof configSchema>;

/**
 * Validates environment variables at startup.
 * Throws if any required variable is missing or invalid.
 * The application WILL NOT START with invalid configuration.
 */
export function validateConfig(config: Record<string, unknown>): AppConfig {
  const result = configSchema.safeParse(config);
  if (!result.success) {
    const errors = result.error.issues
      .map((e) => `  ${e.path.join('.')}: ${e.message}`)
      .join('\n');
    throw new Error(`❌ Invalid environment configuration:\n${errors}`);
  }
  return result.data;
}
