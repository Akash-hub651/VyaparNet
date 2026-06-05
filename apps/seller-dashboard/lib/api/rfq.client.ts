import { z } from 'zod';
import { getApiBaseUrl } from '../config';

// ─────────────────────────────────────────────────────────────
// Raw Backend DTO schemas
// ─────────────────────────────────────────────────────────────

export const RfqResponseSchema = z.object({
  id: z.string(),
  rfqId: z.string().optional(), // Expected format like #RFQ-2045
  businessId: z.string().optional(),
  segment: z.string().optional(),
  productName: z.string().optional(),
  description: z.string().optional(),
  quantity: z.number().optional(),
  unit: z.string().optional(),
  budgetMin: z.number().nullable().optional(),
  budgetMax: z.number().nullable().optional(),
  expiresAt: z.string().datetime().optional(),
  status: z.enum(['NOT_QUOTED', 'QUOTED', 'EXPIRED', 'WON', 'LOST']).optional(),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
}).catchall(z.any()); // Loosely typed adapter pattern

export type RfqResponse = z.infer<typeof RfqResponseSchema>;

export const RfqListResponseSchema = z.object({
  data: z.array(RfqResponseSchema),
  metadata: z.object({
    counts: z.object({
      NOT_QUOTED: z.number().optional(),
      QUOTED: z.number().optional(),
      EXPIRED: z.number().optional(),
      WON: z.number().optional(),
      LOST: z.number().optional(),
      TOTAL: z.number().optional(),
    }).optional(),
  }).optional(),
  total: z.number().optional(),
  nextCursor: z.string().nullable().optional(),
});

export type RfqListResponse = z.infer<typeof RfqListResponseSchema>;

// ─────────────────────────────────────────────────────────────
// Normalized View Models
// ─────────────────────────────────────────────────────────────

export type RfqStatus = 'NOT_QUOTED' | 'QUOTED' | 'EXPIRED' | 'WON' | 'LOST';

export interface RfqViewModel {
  id: string;
  rfqId: string;
  segment: string;
  productRequired: string;
  quantity: number;
  unit: string;
  budgetMin: number | null;
  budgetMax: number | null;
  expiresAt: string;
  status: RfqStatus;
}

export function adaptRfqToViewModel(raw: RfqResponse): RfqViewModel {
  return {
    id: raw.id,
    rfqId: raw.rfqId || `#RFQ-${raw.id.slice(0, 6).toUpperCase()}`,
    segment: raw.segment || 'GENERAL',
    productRequired: raw.productName || raw.description || 'Unknown Product',
    quantity: raw.quantity || 0,
    unit: raw.unit || 'units',
    budgetMin: raw.budgetMin ?? null,
    budgetMax: raw.budgetMax ?? null,
    expiresAt: raw.expiresAt || new Date().toISOString(),
    status: raw.status || 'NOT_QUOTED',
  };
}

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
 * GET /api/v1/seller/rfq
 */
export async function getSellerRfqs(
  params: { limit?: number; cursor?: string; status?: RfqStatus },
  token: string,
): Promise<ApiResult<RfqListResponse>> {
  try {
    const sp = new URLSearchParams();
    if (params.limit !== undefined) sp.set('limit', String(params.limit));
    if (params.cursor) sp.set('cursor', params.cursor);
    if (params.status) sp.set('status', params.status);

    const url = `${getApiBaseUrl()}/api/v1/seller/rfq?${sp.toString()}`;
    const res = await fetch(url, { headers: buildAuthHeaders(token) });
    return parseApiResponse(res, RfqListResponseSchema);
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : 'Unknown error' } };
  }
}
