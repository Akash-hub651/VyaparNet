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

  // ─── JWT ────────────────────────────────────────────────────
  JWT_SECRET: z
    .string()
    .min(32, 'JWT_SECRET must be at least 32 characters for security'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  // Database
  DATABASE_URL: z.string().url('DATABASE_URL must be a valid PostgreSQL URL'),

  // Redis
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.string().regex(/^\d+$/).default('6379').transform(Number),
  REDIS_PASSWORD: z.string().optional(),

  // CORS
  CORS_ORIGINS: z.string().default('http://localhost:3000'),

  // Rate limiting (Sprint 0 legacy)
  RATE_LIMIT_TTL_MS: z.string().default('60000').transform(Number),
  RATE_LIMIT_MAX: z.string().default('100').transform(Number),

  // BullMQ
  BULLMQ_CONCURRENCY: z.string().default('5').transform(Number),

  // ─── SMS ────────────────────────────────────────────────────
  SMS_PROVIDER: z.enum(['msg91', 'twilio', 'stub']).default('stub'),
  MSG91_AUTH_KEY: z.string().optional(),
  MSG91_TEMPLATE_ID: z.string().optional(),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_FROM_NUMBER: z.string().optional(),

  // ─── Throttler (Sprint 1) ───────────────────────────────────
  THROTTLER_TTL_MS: z.string().default('60000').transform(Number),
  THROTTLER_LIMIT: z.string().default('100').transform(Number),

  // ─── Razorpay ─────────────────────────────────────────────
  // HARDENED: Secrets MUST NOT have .default() values — a missing secret in
  // production must fail startup, not silently use a placeholder.
  // Use RAZORPAY_KEY_ID placeholder default is acceptable (non-secret public ID).
  RAZORPAY_KEY_ID: z.string().default('rzp_test_placeholder'),
  RAZORPAY_KEY_SECRET: z
    .string()
    .min(
      8,
      'RAZORPAY_KEY_SECRET must be explicitly set — no placeholder allowed in production',
    ),
  RAZORPAY_WEBHOOK_SECRET: z
    .string()
    .min(
      8,
      'RAZORPAY_WEBHOOK_SECRET must be explicitly set — no placeholder allowed in production',
    ),

  // ─── AWS & S3 (Sprint 2 / Phase 3) ──────────────────────────
  AWS_REGION: z.string().default('ap-south-1'),
  AWS_ACCESS_KEY_ID: z.string().default('dummy_access_key'),
  AWS_SECRET_ACCESS_KEY: z.string().default('dummy_secret_key'),
  AWS_S3_BUCKET: z.string().default('vyaparnet-media-dev'),
  CDN_BASE_URL: z.string().default('https://cdn.vyaparnet.dev/'),

  // ─── Email & Notification (Sprint 6) ────────────────────────
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM_ADDRESS: z.string().optional(),
  VAPID_EMAIL: z.string().optional(),
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),

  // ─── Admin Bootstrap (Sprint 7) ────────────────────────────
  ADMIN_BOOTSTRAP_PHONE: z.string().optional(),
  ADMIN_BOOTSTRAP_PASSWORD: z.string().optional(),
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
