import { z } from "zod";
import { getApiBaseUrl } from "../config";

// ─────────────────────────────────────────────────────────────
// Raw Backend DTO schemas
// ─────────────────────────────────────────────────────────────

const NegotiationEventSchema = z.object({
  id: z.string(),
  round: z.number(),
  type: z.enum([
    "SELLER_QUOTE",
    "BUYER_COUNTER",
    "SELLER_COUNTER",
    "BUYER_ACCEPT",
    "SELLER_ACCEPT",
    "SELLER_DECLINE",
    "BUYER_DECLINE",
  ]),
  message: z.string().optional(),
  price: z.number().optional(),
  minQuantity: z.number().optional(),
  deliveryDays: z.number().optional(),
  createdAt: z.string().datetime(),
});

export const RfqResponseSchema = z
  .object({
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
    status: z
      .enum(["NOT_QUOTED", "QUOTED", "EXPIRED", "WON", "LOST"])
      .optional(),
    requirements: z.any().optional(),
    buyerContext: z
      .object({
        type: z.string().optional(),
        rating: z.number().optional(),
        location: z.string().optional(),
      })
      .optional(),
    negotiations: z.array(NegotiationEventSchema).optional(),
    createdAt: z.string().datetime().optional(),
    updatedAt: z.string().datetime().optional(),
  })
  .catchall(z.any()); // Loosely typed adapter pattern

export type NegotiationEvent = z.infer<typeof NegotiationEventSchema>;
export type RfqResponse = z.infer<typeof RfqResponseSchema>;

export const RfqListResponseSchema = z.object({
  data: z.array(RfqResponseSchema),
  metadata: z
    .object({
      counts: z
        .object({
          NOT_QUOTED: z.number().optional(),
          QUOTED: z.number().optional(),
          EXPIRED: z.number().optional(),
          WON: z.number().optional(),
          LOST: z.number().optional(),
          TOTAL: z.number().optional(),
        })
        .optional(),
    })
    .optional(),
  total: z.number().optional(),
  nextCursor: z.string().nullable().optional(),
});

export type RfqListResponse = z.infer<typeof RfqListResponseSchema>;

// ─────────────────────────────────────────────────────────────
// Normalized View Models
// ─────────────────────────────────────────────────────────────

export type RfqStatus = "NOT_QUOTED" | "QUOTED" | "EXPIRED" | "WON" | "LOST";

export interface RfqViewModel {
  id: string;
  rfqId: string;
  segment: string;
  productRequired: string;
  description: string;
  quantity: number;
  unit: string;
  budgetMin: number | null;
  budgetMax: number | null;
  expiresAt: string;
  status: RfqStatus;
  createdAt: string;
  requirements: Record<string, unknown>;
  buyerContext: {
    type?: string;
    rating?: number;
    location?: string;
  };
  negotiations: NegotiationEvent[];
}

export function adaptRfqToViewModel(raw: RfqResponse): RfqViewModel {
  return {
    id: raw.id,
    rfqId: raw.rfqId || `#RFQ-${raw.id.slice(0, 6).toUpperCase()}`,
    segment: raw.segment || "GENERAL",
    productRequired: raw.productName || raw.description || "Unknown Product",
    description: raw.description || "",
    quantity: raw.quantity || 0,
    unit: raw.unit || "units",
    budgetMin: raw.budgetMin ?? null,
    budgetMax: raw.budgetMax ?? null,
    expiresAt: raw.expiresAt || new Date().toISOString(),
    status: raw.status || "NOT_QUOTED",
    createdAt: raw.createdAt || new Date().toISOString(),
    requirements: raw.requirements || {},
    buyerContext: raw.buyerContext || {},
    negotiations: raw.negotiations || [],
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
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

async function parseApiResponse<T>(
  res: Response,
  schema: z.ZodType<T>,
): Promise<ApiResult<T>> {
  if (!res.ok) {
    const errBody = (await res
      .json()
      .catch(() => ({ message: res.statusText }))) as { message?: string };
    return {
      data: null,
      error: { message: errBody.message ?? res.statusText, status: res.status },
    };
  }
  const json = (await res.json()) as { success: boolean; data: unknown };
  if (!json.success) {
    return {
      data: null,
      error: { message: "API returned unsuccessful response" },
    };
  }
  const parsed = schema.safeParse(json.data);
  if (!parsed.success) {
    return {
      data: null,
      error: {
        message: `Response schema validation failed: ${parsed.error.message}`,
      },
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
    if (params.limit !== undefined) sp.set("limit", String(params.limit));
    if (params.cursor) sp.set("cursor", params.cursor);
    if (params.status) sp.set("status", params.status);

    const url = `${getApiBaseUrl()}/api/v1/seller/rfq?${sp.toString()}`;
    const res = await fetch(url, { headers: buildAuthHeaders(token) });
    return parseApiResponse(res, RfqListResponseSchema);
  } catch (err) {
    return {
      data: null,
      error: { message: err instanceof Error ? err.message : "Unknown error" },
    };
  }
}

/**
 * INTERIM GET /api/v1/seller/rfq/:id
 * Fetches list and filters by id.
 */
export async function getSellerRfqDetail(
  id: string,
  token: string,
): Promise<ApiResult<{ data: RfqResponse }>> {
  const res = await getSellerRfqs({}, token);
  if (res.error) return res;

  const found = res.data.data.find((r) => r.id === id);
  if (!found) {
    return { data: null, error: { message: "RFQ not found", status: 404 } };
  }
  return { data: { data: found }, error: null };
}

/**
 * POST /api/v1/seller/rfq/:id/quote
 */
export async function submitQuote(
  id: string,
  payload: Record<string, unknown>,
  token: string,
): Promise<ApiResult<unknown>> {
  try {
    const res = await fetch(
      `${getApiBaseUrl()}/api/v1/seller/rfq/${id}/quote`,
      {
        method: "POST",
        headers: buildAuthHeaders(token),
        body: JSON.stringify(payload),
      },
    );
    return parseApiResponse(res, z.unknown());
  } catch (err) {
    return {
      data: null,
      error: { message: err instanceof Error ? err.message : "Unknown error" },
    };
  }
}

/**
 * POST /api/v1/seller/rfq/:id/counter
 */
export async function counterQuote(
  id: string,
  payload: Record<string, unknown>,
  token: string,
): Promise<ApiResult<unknown>> {
  try {
    const res = await fetch(
      `${getApiBaseUrl()}/api/v1/seller/rfq/${id}/counter`,
      {
        method: "POST",
        headers: buildAuthHeaders(token),
        body: JSON.stringify(payload),
      },
    );
    return parseApiResponse(res, z.unknown());
  } catch (err) {
    return {
      data: null,
      error: { message: err instanceof Error ? err.message : "Unknown error" },
    };
  }
}

/**
 * POST /api/v1/seller/rfq/:id/accept
 */
export async function acceptRfq(
  id: string,
  token: string,
): Promise<ApiResult<unknown>> {
  try {
    const res = await fetch(
      `${getApiBaseUrl()}/api/v1/seller/rfq/${id}/accept`,
      {
        method: "POST",
        headers: buildAuthHeaders(token),
        body: JSON.stringify({}),
      },
    );
    return parseApiResponse(res, z.unknown());
  } catch (err) {
    return {
      data: null,
      error: { message: err instanceof Error ? err.message : "Unknown error" },
    };
  }
}

/**
 * POST /api/v1/seller/rfq/:id/decline
 */
export async function declineRfq(
  id: string,
  reason: string,
  token: string,
): Promise<ApiResult<unknown>> {
  try {
    const res = await fetch(
      `${getApiBaseUrl()}/api/v1/seller/rfq/${id}/decline`,
      {
        method: "POST",
        headers: buildAuthHeaders(token),
        body: JSON.stringify({ reason }),
      },
    );
    return parseApiResponse(res, z.unknown());
  } catch (err) {
    return {
      data: null,
      error: { message: err instanceof Error ? err.message : "Unknown error" },
    };
  }
}
