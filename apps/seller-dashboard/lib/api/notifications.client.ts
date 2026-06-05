import { z } from "zod";
import { getApiBaseUrl } from "../config";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export type NotificationPriority = "CRITICAL" | "IMPORTANT" | "INFO";

export type NotificationType =
  | "NEW_ORDER"
  | "ORDER_CONFIRMED"
  | "RETURN_INITIATED"
  | "DISPUTE_OPEN"
  | "QUOTE_ACCEPTED"
  | "LOW_STOCK"
  | "KYC_APPROVED"
  | "KYC_REJECTED"
  | "PRODUCT_APPROVED"
  | "PRODUCT_REJECTED"
  | "PAYOUT_INITIATED"
  | "SYSTEM_UPDATE";

export const NotificationSchema = z
  .object({
    id: z.string(),
    type: z.enum([
      "NEW_ORDER",
      "ORDER_CONFIRMED",
      "RETURN_INITIATED",
      "DISPUTE_OPEN",
      "QUOTE_ACCEPTED",
      "LOW_STOCK",
      "KYC_APPROVED",
      "KYC_REJECTED",
      "PRODUCT_APPROVED",
      "PRODUCT_REJECTED",
      "PAYOUT_INITIATED",
      "SYSTEM_UPDATE",
    ]),
    priority: z.enum(["CRITICAL", "IMPORTANT", "INFO"]),
    title: z.string(),
    body: z.string(),
    isRead: z.boolean(),
    actionUrl: z.string().nullable().optional(),
    createdAt: z.string().datetime(),
  })
  .catchall(z.unknown());

export const NotificationListSchema = z.object({
  data: z.array(NotificationSchema),
  unreadCount: z.number().optional(),
  total: z.number().optional(),
  nextCursor: z.string().nullable().optional(),
});

export type NotificationViewModel = z.infer<typeof NotificationSchema>;

// ─────────────────────────────────────────────────────────────
// Common API Helpers
// ─────────────────────────────────────────────────────────────

interface ApiResult<T> {
  data: T | null;
  error: { message: string } | null;
}

async function parseApiResponse<T>(
  res: Response,
  schema: z.ZodType<T>,
): Promise<ApiResult<T>> {
  if (!res.ok) {
    let msg = "Network response was not ok";
    try {
      const errBody = await res.json();
      msg = errBody?.message || msg;
    } catch {
      // ignore JSON parse error
    }
    return { data: null, error: { message: msg } };
  }

  try {
    const json = await res.json();
    const parsed = schema.parse(json);
    return { data: parsed, error: null };
  } catch (err) {
    console.error("Notification API schema mismatch:", err);
    return { data: null, error: { message: "Data format error from server" } };
  }
}

// ─────────────────────────────────────────────────────────────
// API Methods
// ─────────────────────────────────────────────────────────────

/**
 * GET /api/v1/seller/notifications
 */
export async function getSellerNotifications(
  token: string,
  tab: string = "Sab",
): Promise<ApiResult<z.infer<typeof NotificationListSchema>>> {
  try {
    const query = new URLSearchParams();
    if (tab !== "Sab") {
      query.append("filter", tab.toUpperCase());
    }
    const res = await fetch(
      `${getApiBaseUrl()}/api/v1/seller/notifications?${query.toString()}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      },
    );

    return parseApiResponse(res, NotificationListSchema);
  } catch (err) {
    return {
      data: null,
      error: { message: err instanceof Error ? err.message : "Unknown error" },
    };
  }
}

/**
 * PATCH /api/v1/seller/notifications/:id/read
 */
export async function markNotificationRead(
  id: string,
  token: string,
): Promise<ApiResult<unknown>> {
  try {
    const res = await fetch(
      `${getApiBaseUrl()}/api/v1/seller/notifications/${id}/read`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
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
 * PATCH /api/v1/seller/notifications/read-all
 */
export async function markAllNotificationsRead(
  token: string,
): Promise<ApiResult<unknown>> {
  try {
    const res = await fetch(
      `${getApiBaseUrl()}/api/v1/seller/notifications/read-all`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
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
