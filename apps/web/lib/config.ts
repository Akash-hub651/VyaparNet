/**
 * API Configuration — apps/web/lib/config.ts
 *
 * Central configuration for API base URL resolution.
 * Server components use NEXT_PUBLIC_API_URL.
 * Client components use the same env var via NEXT_PUBLIC_ prefix.
 */

/**
 * Returns the API base URL.
 * - In production: NEXT_PUBLIC_API_URL (e.g. https://api.vyaparnet.com)
 * - In development: http://localhost:3001 (default NestJS port)
 */
export function getApiBaseUrl(): string {
  // NEXT_PUBLIC_API_URL is available on both server and client
  return process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001';
}
