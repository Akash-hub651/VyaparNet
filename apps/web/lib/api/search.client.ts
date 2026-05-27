/**
 * Search API Client — apps/web/lib/api/search.client.ts
 *
 * Authority: SPRINT2_IMPLEMENTATION_LOCKED_final_v2.0.md Section 9.1
 *
 * Rules:
 * - Returns { data, error } discriminated union — NEVER throws
 * - Includes Authorization header if token present
 * - Zod-validated response schemas
 * - Typed request params
 */

import { z } from 'zod';
import { Segment } from '@vyaparnet/types';
import { getApiBaseUrl } from '../config';

// ─────────────────────────────────────────────────────────────
// Response schemas (Zod-validated)
// ─────────────────────────────────────────────────────────────

const MediaSummarySchema = z.object({
  id: z.string(),
  url: z.string(),
  mediaClass: z.string(),
  displayOrder: z.number(),
});

export const SearchProductDocumentSchema = z.object({
  id: z.string(),
  productId: z.string(),
  name: z.string(),
  description: z.string().nullable().optional(),
  slug: z.string(),
  segment: z.nativeEnum(Segment),
  categoryId: z.string(),
  categoryName: z.string().optional(),
  basePrice: z.number(),
  mrp: z.number().nullable().optional(),
  moq: z.number(),
  unit: z.string(),
  tags: z.array(z.string()).default([]),
  segmentAttributes: z.record(z.string(), z.any()).default({}),
  primaryImageUrl: z.string().nullable().optional(),
  media: z.array(MediaSummarySchema).default([]),
  sellerName: z.string().optional(),
  sellerVerified: z.boolean().optional(),
  lastIndexedAt: z.string().datetime().optional().nullable(),
});

export type SearchProductDocument = z.infer<typeof SearchProductDocumentSchema>;

export const SearchResponseSchema = z.object({
  data: z.array(SearchProductDocumentSchema),
  total: z.number(),
  nextCursorId: z.string().nullable().optional(),
  nextCursorCreatedAt: z.string().nullable().optional(),
  fallbackUsed: z.boolean().optional(),
  engine: z.enum(['postgres', 'opensearch']).optional(),
});

export type SearchResponse = z.infer<typeof SearchResponseSchema>;

export const SearchSuggestionResponseSchema = z.object({
  suggestions: z.array(
    z.object({
      text: z.string(),
      type: z.enum(['product', 'category', 'synonym']).optional(),
    })
  ),
});

export type SearchSuggestionResponse = z.infer<typeof SearchSuggestionResponseSchema>;

// ─────────────────────────────────────────────────────────────
// Request param types
// ─────────────────────────────────────────────────────────────

export interface SearchProductsParams {
  q: string;
  segment: Segment;
  limit?: number;
  categoryId?: string;
  minPrice?: number;
  maxPrice?: number;
  cursorId?: string;
  cursorCreatedAt?: string;
  sort?: 'relevance' | 'price_asc' | 'price_desc' | 'newest';
}

export interface GetSuggestionsParams {
  q: string;
  segment: Segment;
  limit?: number;
}

// ─────────────────────────────────────────────────────────────
// Client type
// ─────────────────────────────────────────────────────────────

type ApiResult<T> =
  | { data: T; error: null }
  | { data: null; error: { message: string; status?: number } };

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function buildAuthHeaders(token?: string | null): HeadersInit {
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

function buildSearchParams(params: Record<string, unknown>): URLSearchParams {
  const sp = new URLSearchParams();
  for (const [key, val] of Object.entries(params)) {
    if (val !== undefined && val !== null && val !== '') {
      sp.set(key, String(val));
    }
  }
  return sp;
}

// ─────────────────────────────────────────────────────────────
// Search API Client
// ─────────────────────────────────────────────────────────────

/**
 * Search products using the full-text search engine.
 * Calls GET /api/v1/search/products
 *
 * @param params - Search parameters (q, segment required)
 * @param token - Optional JWT for auth-scoped cache keys
 */
export async function searchProducts(
  params: SearchProductsParams,
  token?: string | null,
): Promise<ApiResult<SearchResponse>> {
  try {
    const qp = buildSearchParams({
      q: params.q,
      segment: params.segment,
      limit: params.limit ?? 20,
      categoryId: params.categoryId,
      minPrice: params.minPrice,
      maxPrice: params.maxPrice,
      cursorId: params.cursorId,
      cursorCreatedAt: params.cursorCreatedAt,
      sort: params.sort ?? 'relevance',
    });

    const url = `${getApiBaseUrl()}/api/v1/search/products?${qp.toString()}`;
    const res = await fetch(url, {
      headers: buildAuthHeaders(token),
      cache: 'no-store', // Buyer search is always fresh
    });

    if (!res.ok) {
      return {
        data: null,
        error: { message: `Search failed: ${res.statusText}`, status: res.status },
      };
    }

    const json = await res.json() as unknown;
    // Expect { success: true, data: SearchResponse }
    const envelope = json as { success: boolean; data: unknown };
    if (!envelope.success) {
      return { data: null, error: { message: 'Search returned unsuccessful response' } };
    }

    const parsed = SearchResponseSchema.safeParse(envelope.data);
    if (!parsed.success) {
      return {
        data: null,
        error: { message: `Search response schema validation failed: ${parsed.error.message}` },
      };
    }

    return { data: parsed.data, error: null };
  } catch (err) {
    return {
      data: null,
      error: { message: err instanceof Error ? err.message : 'Unknown search error' },
    };
  }
}

/**
 * Get search autocomplete suggestions.
 * Calls GET /api/v1/search/suggestions
 */
export async function getSearchSuggestions(
  params: GetSuggestionsParams,
  token?: string | null,
): Promise<ApiResult<SearchSuggestionResponse>> {
  try {
    const qp = buildSearchParams({
      q: params.q,
      segment: params.segment,
      limit: params.limit ?? 5,
    });

    const url = `${getApiBaseUrl()}/api/v1/search/suggestions?${qp.toString()}`;
    const res = await fetch(url, {
      headers: buildAuthHeaders(token),
    });

    if (!res.ok) {
      return {
        data: null,
        error: { message: `Suggestions failed: ${res.statusText}`, status: res.status },
      };
    }

    const json = await res.json() as unknown;
    const envelope = json as { success: boolean; data: unknown };
    if (!envelope.success) {
      return { data: null, error: { message: 'Suggestions returned unsuccessful response' } };
    }

    const parsed = SearchSuggestionResponseSchema.safeParse(envelope.data);
    if (!parsed.success) {
      return {
        data: null,
        error: { message: `Suggestions schema validation failed: ${parsed.error.message}` },
      };
    }

    return { data: parsed.data, error: null };
  } catch (err) {
    return {
      data: null,
      error: { message: err instanceof Error ? err.message : 'Unknown suggestions error' },
    };
  }
}
