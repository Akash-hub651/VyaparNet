/**
 * Shared API Client — apps/seller-dashboard/lib/api/client.ts
 *
 * Authority: seller_dashboard_architecture.md §8 (Module Architecture)
 * Pattern: ApiResult<T>, buildAuthHeaders, parseApiResponse
 *
 * All API client files (orders.client.ts, products.client.ts, etc.) use
 * this shared wrapper. NEVER call fetch() directly in a component or page.
 *
 * Rules:
 * - Every call carries Bearer token (JWT-scoped authority — architecture §1)
 * - 401 → triggers auth context logout (redirect to /login)
 * - Error messages: always Hinglish-safe (INVARIANT-UX-7)
 * - Standardized ApiResult<T> return type — never throws, always returns
 */

import { buildApiUrl } from '../config';

/* ── RESULT TYPE ─────────────────────────────────────────────── */
export type ApiResult<T> =
  | { success: true;  data: T }
  | { success: false; error: string; statusCode?: number };

/* ── AUTH HEADERS ────────────────────────────────────────────── */
export function buildAuthHeaders(token: string): HeadersInit {
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

/* ── ERROR MESSAGE PARSER ────────────────────────────────────── */
function parseErrorMessage(body: unknown): string {
  if (typeof body === 'object' && body !== null) {
    const b = body as Record<string, unknown>;
    // NestJS standard error format
    if (typeof b['message'] === 'string') return b['message'];
    if (Array.isArray(b['message'])) return (b['message'] as string[]).join(', ');
    if (typeof b['error'] === 'string') return b['error'];
  }
  return 'Kuch galat hua. Dobara try karein.';
}

/* ── CORE FETCH WRAPPER ──────────────────────────────────────── */
/**
 * Main API fetch utility.
 * - Builds full URL from path (e.g., '/seller/orders?limit=20')
 * - Injects auth headers
 * - Parses response JSON
 * - Returns ApiResult<T> (never throws)
 *
 * @param path     - API path (without base URL or /api/v1 prefix)
 * @param token    - JWT access token from auth context
 * @param options  - Additional fetch options (method, body, etc.)
 */
export async function apiFetch<T>(
  path: string,
  token: string,
  options: RequestInit & { skipV1Prefix?: boolean } = {},
): Promise<ApiResult<T>> {
  const { skipV1Prefix, ...fetchOptions } = options;
  const url = skipV1Prefix
    ? `${getBaseWithoutVersion()}${path.startsWith('/') ? path : `/${path}`}`
    : buildApiUrl(path);

  try {
    const res = await fetch(url, {
      ...fetchOptions,
      headers: {
        ...buildAuthHeaders(token),
        ...(fetchOptions.headers ?? {}),
      },
    });

    // 401 — token expired or invalid
    if (res.status === 401) {
      // Dispatch global event so AuthContext can react centrally
      // Authority: architecture §10 "Auth Guard" — central session clear
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('auth:401'));
      }
      return { success: false, error: 'Session expire ho gayi. Dobara login karein.', statusCode: 401 };
    }

    // 403 — permission denied
    if (res.status === 403) {
      return { success: false, error: 'Is action ki permission nahi hai.', statusCode: 403 };
    }

    // 404
    if (res.status === 404) {
      return { success: false, error: 'Requested data nahi mila.', statusCode: 404 };
    }

    // Parse body
    let body: unknown;
    const contentType = res.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      body = await res.json();
    } else {
      body = await res.text();
    }

    if (!res.ok) {
      return {
        success: false,
        error: parseErrorMessage(body),
        statusCode: res.status,
      };
    }

    // NestJS standard success wrapper: { success: true, data: T }
    if (
      typeof body === 'object' && body !== null &&
      'success' in body && (body as Record<string, unknown>)['success'] === true &&
      'data' in body
    ) {
      return { success: true, data: (body as { success: true; data: T }).data };
    }

    // Bare response (not wrapped)
    return { success: true, data: body as T };

  } catch (err) {
    // Network error, CORS, etc.
    // SECURITY: navigator.onLine is browser-only — guard for SSR safety
    const message = err instanceof Error ? err.message : 'Network error';
    const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
    return {
      success: false,
      error: isOffline
        ? 'Internet connection nahi hai. Connection check karein.'
        : `Server se connect nahi ho pa raha: ${message}`,
    };
  }
}

/* ── HELPERS ─────────────────────────────────────────────────── */
function getBaseWithoutVersion(): string {
  return process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3003';
}

/** Build query string from object — filters out undefined/null values */
export function buildQueryString(params: Record<string, string | number | boolean | undefined | null>): string {
  const qs = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  return qs ? `?${qs}` : '';
}

/** Convenience wrappers */
export async function apiGet<T>(path: string, token: string): Promise<ApiResult<T>> {
  return apiFetch<T>(path, token, { method: 'GET' });
}

export async function apiPost<T>(path: string, token: string, body: unknown): Promise<ApiResult<T>> {
  return apiFetch<T>(path, token, { method: 'POST', body: JSON.stringify(body) });
}

export async function apiPatch<T>(path: string, token: string, body: unknown): Promise<ApiResult<T>> {
  return apiFetch<T>(path, token, { method: 'PATCH', body: JSON.stringify(body) });
}

export async function apiPut<T>(path: string, token: string, body: unknown): Promise<ApiResult<T>> {
  return apiFetch<T>(path, token, { method: 'PUT', body: JSON.stringify(body) });
}

export async function apiDelete<T>(path: string, token: string): Promise<ApiResult<T>> {
  return apiFetch<T>(path, token, { method: 'DELETE' });
}
