/**
 * API Configuration — apps/seller-dashboard/lib/config.ts
 *
 * Authority: seller_dashboard_architecture.md §8
 * FIXED (ARCH-REV): Default port corrected from 3001 → 3003
 */

export function getApiBaseUrl(): string {
  return process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3003';
}

export const API_VERSION = 'api/v1';

export function buildApiUrl(path: string): string {
  const base = getApiBaseUrl();
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}/${API_VERSION}${cleanPath}`;
}

/** Default pagination limit — ALL list pages use this. Never 0, never unbounded.
 *  Authority: architecture §4 "Default Pagination Limit (ARCH-REV-SD-15 RESOLVED)" */
export const DEFAULT_PAGE_LIMIT = 20;

/** Configurable max negotiation rounds.
 *  Authority: architecture §12 (ARCH-REV-SD-11 RESOLVED) — NOT hardcoded inline.
 *  Sprint 9: Replace with API response from GET /seller/config */
export const MAX_NEGOTIATION_ROUNDS = 3;

/** Sidebar collapse localStorage key.
 *  Authority: architecture §4 — the ONLY permitted localStorage usage.
 *  NEVER store auth data in localStorage. */
export const SIDEBAR_COLLAPSE_KEY = 'seller-sidebar-collapsed';
