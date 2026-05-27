/**
 * API Configuration — apps/seller-dashboard/lib/config.ts
 */
export function getApiBaseUrl(): string {
  return process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001';
}
