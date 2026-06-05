/**
 * Products API Client — apps/seller-dashboard/lib/api/products.client.ts
 *
 * Authority: seller_dashboard_architecture.md §8 & §9
 *
 * Rules:
 * - Returns ApiResult<T> discriminated union from client.ts
 * - Uses apiGet, apiPost, apiPatch, apiDelete shared wrappers
 * - NEVER uses raw fetch
 */

import { ProductStatus, MediaClass, Segment } from "@vyaparnet/types";
import {
  apiGet,
  apiPost,
  apiPut,
  apiDelete,
  buildQueryString,
  ApiResult,
} from "./client";

// ─────────────────────────────────────────────────────────────
// Response schemas (for types)
// ─────────────────────────────────────────────────────────────

export interface ProductMediaResponse {
  id: string;
  mediaId: string;
  displayOrder: number;
  mediaClass: MediaClass;
  url: string;
  altText?: string | null;
}

export interface ProductResponse {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  basePrice: number;
  mrp?: number | null;
  moq: number;
  unit: string;
  hsnCode?: string | null;
  gstPercent?: number | null;
  tags: string[];
  status: ProductStatus;
  segment: Segment;
  segmentAttributes: Record<string, unknown>;
  categoryId: string;
  categoryName?: string;
  categoryPath?: Array<{ id: string; name: string; slug: string }>;
  sellerId: string;
  sellerName?: string;
  sellerVerified?: boolean;
  media: ProductMediaResponse[];
  lastIndexedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  // Included rejection reason for Screen 04 Rejected Tab
  rejectionReason?: string;
}

export interface ProductListResponse {
  data: ProductResponse[];
  total: number;
  nextCursorId?: string | null;
  nextCursorCreatedAt?: string | null;
}

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
  initialStock?: number;
  lowStockAlert?: number;
  mediaIds?: string[];
  segmentAttributes?: Record<string, unknown>;
}

export type UpdateProductDto = Partial<CreateProductDto>;

export interface GetSellerProductsParams {
  status?: ProductStatus;
  limit?: number;
  cursorId?: string;
  cursorCreatedAt?: string;
  segment?: Segment;
  query?: string;
}

// ─────────────────────────────────────────────────────────────
// Products API Client functions
// ─────────────────────────────────────────────────────────────

/**
 * GET /api/v1/products/:slug
 * Used for buyer product detail page
 */
export async function getProduct(
  slug: string,
  token: string,
): Promise<ApiResult<ProductResponse>> {
  return apiGet<ProductResponse>(
    `api/v1/products/${encodeURIComponent(slug)}`,
    token,
  );
}

/**
 * GET /api/v1/products/seller — seller's own products
 * Authority: seller_dashboard_architecture.md §9 (AUDIT-3 RESOLVED)
 */
export async function getSellerProducts(
  params: GetSellerProductsParams,
  token: string,
): Promise<ApiResult<ProductListResponse>> {
  const qs = buildQueryString({
    status: params.status,
    limit: params.limit ?? 20,
    cursorId: params.cursorId,
    cursorCreatedAt: params.cursorCreatedAt,
    segment: params.segment,
    query: params.query,
  });
  return apiGet<ProductListResponse>(`api/v1/products/seller${qs}`, token);
}

/**
 * GET /api/v1/products/seller/:id — get a specific product for edit
 */
export async function getSellerProduct(
  id: string,
  token: string,
): Promise<ApiResult<ProductResponse>> {
  return apiGet<ProductResponse>(`api/v1/products/seller/${id}`, token);
}

/**
 * POST /api/v1/products — create product (DRAFT status)
 */
export async function createProduct(
  dto: CreateProductDto,
  token: string,
): Promise<ApiResult<ProductResponse>> {
  return apiPost<ProductResponse>("api/v1/products", token, dto);
}

/**
 * PUT /api/v1/products/:id — update product
 */
export async function updateProduct(
  id: string,
  dto: UpdateProductDto,
  token: string,
): Promise<ApiResult<ProductResponse>> {
  return apiPut<ProductResponse>(`api/v1/products/${id}`, token, dto);
}

/**
 * POST /api/v1/products/:id/publish — transition DRAFT → PENDING_APPROVAL or ACTIVE
 */
export async function publishProduct(
  id: string,
  token: string,
): Promise<ApiResult<ProductResponse>> {
  return apiPost<ProductResponse>(`api/v1/products/${id}/publish`, token, {});
}

/**
 * DELETE /api/v1/products/:id — archive product
 */
export async function archiveProduct(
  id: string,
  token: string,
): Promise<ApiResult<{ success: true }>> {
  return apiDelete<{ success: true }>(`api/v1/products/${id}`, token);
}

/**
 * POST /api/v1/products/:id/restore — restore archived product
 */
export async function restoreProduct(
  id: string,
  token: string,
): Promise<ApiResult<ProductResponse>> {
  return apiPost<ProductResponse>(`api/v1/products/${id}/restore`, token, {});
}
