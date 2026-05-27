/**
 * Products API Client — apps/web/lib/api/products.client.ts
 *
 * Authority: SPRINT2_IMPLEMENTATION_LOCKED_final_v2.0.md Section 9.1
 *
 * Rules:
 * - Returns { data, error } discriminated union — NEVER throws
 * - Includes Authorization header if token present
 * - Typed request/response objects
 */

import { z } from 'zod';
import { ProductStatus, MediaClass, Segment } from '@vyaparnet/types';
import { getApiBaseUrl } from '../config';

// ─────────────────────────────────────────────────────────────
// Response schemas
// ─────────────────────────────────────────────────────────────

export const ProductMediaResponseSchema = z.object({
  id: z.string(),
  mediaId: z.string(),
  displayOrder: z.number(),
  mediaClass: z.nativeEnum(MediaClass),
  url: z.string(),
  altText: z.string().nullable().optional(),
});

export type ProductMediaResponse = z.infer<typeof ProductMediaResponseSchema>;

export const ProductResponseSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  description: z.string().nullable().optional(),
  basePrice: z.number(),
  mrp: z.number().nullable().optional(),
  moq: z.number(),
  unit: z.string(),
  hsnCode: z.string().nullable().optional(),
  gstPercent: z.number().nullable().optional(),
  tags: z.array(z.string()).default([]),
  status: z.nativeEnum(ProductStatus),
  segment: z.nativeEnum(Segment),
  segmentAttributes: z.record(z.string(), z.any()).default({}),
  categoryId: z.string(),
  categoryName: z.string().optional(),
  categoryPath: z.array(z.object({ id: z.string(), name: z.string(), slug: z.string() })).optional(),
  sellerId: z.string(),
  sellerName: z.string().optional(),
  sellerVerified: z.boolean().optional(),
  media: z.array(ProductMediaResponseSchema).default([]),
  lastIndexedAt: z.string().datetime().nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type ProductResponse = z.infer<typeof ProductResponseSchema>;

export const ProductListResponseSchema = z.object({
  data: z.array(ProductResponseSchema),
  total: z.number(),
  nextCursorId: z.string().nullable().optional(),
  nextCursorCreatedAt: z.string().nullable().optional(),
});

export type ProductListResponse = z.infer<typeof ProductListResponseSchema>;

// ─────────────────────────────────────────────────────────────
// Request types
// ─────────────────────────────────────────────────────────────

export interface CreateProductDto {
  name: string;
  description?: string;
  basePrice: number;
  mrp?: number;
  moq?: number;
  unit: string;
  categoryId: string;
  hsnCode?: string;
  gstPercent?: number;
  tags?: string[];
  mediaIds?: string[];
  segmentAttributes?: Record<string, unknown>;
}

export interface UpdateProductDto extends Partial<CreateProductDto> {}

export interface GetSellerProductsParams {
  status?: ProductStatus;
  limit?: number;
  cursorId?: string;
  cursorCreatedAt?: string;
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

async function parseApiResponse<T>(
  res: Response,
  schema: z.ZodType<T>,
): Promise<ApiResult<T>> {
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({ message: res.statusText })) as { message?: string };
    return {
      data: null,
      error: { message: errBody.message ?? res.statusText, status: res.status },
    };
  }
  const json = await res.json() as { success: boolean; data: unknown };
  if (!json.success) {
    return { data: null, error: { message: 'API returned unsuccessful response' } };
  }
  const parsed = schema.safeParse(json.data);
  if (!parsed.success) {
    return {
      data: null,
      error: { message: `Response schema validation failed: ${parsed.error.message}` },
    };
  }
  return { data: parsed.data, error: null };
}

// ─────────────────────────────────────────────────────────────
// Products API Client functions
// ─────────────────────────────────────────────────────────────

/**
 * GET /api/v1/products/:slug
 * Used for buyer product detail page (SSR + CSR).
 */
export async function getProduct(
  slug: string,
  token?: string | null,
): Promise<ApiResult<ProductResponse>> {
  try {
    const url = `${getApiBaseUrl()}/api/v1/products/${encodeURIComponent(slug)}`;
    const res = await fetch(url, { headers: buildAuthHeaders(token) });
    return parseApiResponse(res, ProductResponseSchema);
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : 'Unknown error' } };
  }
}

/**
 * GET /api/v1/products/my — seller's own products
 * Auth required.
 */
export async function getSellerProducts(
  params: GetSellerProductsParams,
  token: string,
): Promise<ApiResult<ProductListResponse>> {
  try {
    const qp = buildSearchParams({
      status: params.status,
      limit: params.limit ?? 20,
      cursorId: params.cursorId,
      cursorCreatedAt: params.cursorCreatedAt,
    });
    const url = `${getApiBaseUrl()}/api/v1/products/my?${qp.toString()}`;
    const res = await fetch(url, { headers: buildAuthHeaders(token) });
    return parseApiResponse(res, ProductListResponseSchema);
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : 'Unknown error' } };
  }
}

/**
 * POST /api/v1/products — create product (DRAFT status)
 * Auth required.
 */
export async function createProduct(
  dto: CreateProductDto,
  token: string,
): Promise<ApiResult<ProductResponse>> {
  try {
    const res = await fetch(`${getApiBaseUrl()}/api/v1/products`, {
      method: 'POST',
      headers: buildAuthHeaders(token),
      body: JSON.stringify(dto),
    });
    return parseApiResponse(res, ProductResponseSchema);
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : 'Unknown error' } };
  }
}

/**
 * PUT /api/v1/products/:id — update product
 * Auth required.
 */
export async function updateProduct(
  id: string,
  dto: UpdateProductDto,
  token: string,
): Promise<ApiResult<ProductResponse>> {
  try {
    const res = await fetch(`${getApiBaseUrl()}/api/v1/products/${id}`, {
      method: 'PUT',
      headers: buildAuthHeaders(token),
      body: JSON.stringify(dto),
    });
    return parseApiResponse(res, ProductResponseSchema);
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : 'Unknown error' } };
  }
}

/**
 * POST /api/v1/products/:id/publish — transition DRAFT → PENDING_APPROVAL or ACTIVE
 * Auth required.
 */
export async function publishProduct(
  id: string,
  token: string,
): Promise<ApiResult<ProductResponse>> {
  try {
    const res = await fetch(`${getApiBaseUrl()}/api/v1/products/${id}/publish`, {
      method: 'POST',
      headers: buildAuthHeaders(token),
    });
    return parseApiResponse(res, ProductResponseSchema);
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : 'Unknown error' } };
  }
}

/**
 * DELETE /api/v1/products/:id — archive product
 * Auth required.
 */
export async function archiveProduct(
  id: string,
  token: string,
): Promise<ApiResult<{ success: true }>> {
  try {
    const res = await fetch(`${getApiBaseUrl()}/api/v1/products/${id}`, {
      method: 'DELETE',
      headers: buildAuthHeaders(token),
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({ message: res.statusText })) as { message?: string };
      return { data: null, error: { message: errBody.message ?? res.statusText, status: res.status } };
    }
    return { data: { success: true }, error: null };
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : 'Unknown error' } };
  }
}
