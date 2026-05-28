import { z } from 'zod';
import { getApiBaseUrl } from '../config';

// ─────────────────────────────────────────────────────────────
// Response schemas
// ─────────────────────────────────────────────────────────────

export const InventoryResponseSchema = z.object({
  id: z.string(),
  productId: z.string(),
  productName: z.string().optional(),
  productSlug: z.string().optional(),
  businessId: z.string(),
  segment: z.string(),
  quantity: z.number(),
  reservedQty: z.number(),
  damagedQty: z.number(),
  incomingQty: z.number(),
  lowStockThreshold: z.number(),
  isLowStock: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  version: z.number(),
});

export type InventoryResponse = z.infer<typeof InventoryResponseSchema>;

export const InventoryListResponseSchema = z.object({
  data: z.array(InventoryResponseSchema),
  total: z.number().optional(),
  nextCursor: z.string().nullable().optional(),
});

export type InventoryListResponse = z.infer<typeof InventoryListResponseSchema>;

export const MovementResponseSchema = z.object({
  id: z.string(),
  inventoryId: z.string(),
  type: z.enum(['INBOUND', 'OUTBOUND', 'RESERVATION_MUTATION', 'DAMAGED_LOCK', 'DAMAGED_RELEASE', 'RESTOCK', 'ADJUSTMENT', 'RECONCILIATION']),
  quantity: z.number(),
  reason: z.string().nullable().optional(),
  createdBy: z.string().nullable().optional(),
  createdAt: z.string().datetime(),
});

export type MovementResponse = z.infer<typeof MovementResponseSchema>;

export const MovementListResponseSchema = z.object({
  data: z.array(MovementResponseSchema),
  nextCursor: z.string().nullable().optional(),
});

export type MovementListResponse = z.infer<typeof MovementListResponseSchema>;

// ─────────────────────────────────────────────────────────────
// Client types & helpers
// ─────────────────────────────────────────────────────────────

type ApiResult<T> =
  | { data: T; error: null }
  | { data: null; error: { message: string; status?: number } };

function buildAuthHeaders(token: string): HeadersInit {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };
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
// Client functions
// ─────────────────────────────────────────────────────────────

/**
 * GET /api/v1/inventory/seller/list
 */
export async function getSellerInventory(
  params: { limit?: number; cursor?: string; lowStockOnly?: boolean },
  token: string,
): Promise<ApiResult<InventoryListResponse>> {
  try {
    const sp = new URLSearchParams();
    if (params.limit !== undefined) sp.set('limit', String(params.limit));
    if (params.cursor) sp.set('cursor', params.cursor);
    if (params.lowStockOnly !== undefined) sp.set('lowStockOnly', String(params.lowStockOnly));

    const url = `${getApiBaseUrl()}/api/v1/inventory/seller/list?${sp.toString()}`;
    const res = await fetch(url, { headers: buildAuthHeaders(token) });
    return parseApiResponse(res, InventoryListResponseSchema);
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : 'Unknown error' } };
  }
}

/**
 * PATCH /api/v1/inventory/:productId
 */
export async function updateSellerStock(
  productId: string,
  dto: { quantity: number; lowStockThreshold: number; reason: string },
  token: string,
): Promise<ApiResult<InventoryResponse>> {
  try {
    const url = `${getApiBaseUrl()}/api/v1/inventory/${productId}`;
    const res = await fetch(url, {
      method: 'PATCH',
      headers: buildAuthHeaders(token),
      body: JSON.stringify(dto),
    });
    return parseApiResponse(res, InventoryResponseSchema);
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : 'Unknown error' } };
  }
}

/**
 * GET /api/v1/inventory/:productId/movements
 */
export async function getMovementHistory(
  productId: string,
  params: { limit?: number; cursor?: string },
  token: string,
): Promise<ApiResult<MovementListResponse>> {
  try {
    const sp = new URLSearchParams();
    if (params.limit !== undefined) sp.set('limit', String(params.limit));
    if (params.cursor) sp.set('cursor', params.cursor);

    const url = `${getApiBaseUrl()}/api/v1/inventory/${productId}/movements?${sp.toString()}`;
    const res = await fetch(url, { headers: buildAuthHeaders(token) });
    return parseApiResponse(res, MovementListResponseSchema);
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : 'Unknown error' } };
  }
}
