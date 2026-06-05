/**
 * Support API Client — lib/api/support.client.ts
 *
 * Authority: seller_dashboard_architecture.md §7 (API Client Architecture)
 */

import { apiPost, ApiResult } from "./client";

export interface CreateSupportTicketPayload {
  subjectType: string;
  referenceId?: string;
  message: string;
  screenshotUrl?: string;
}

export interface SupportTicketResponse {
  ticketId: string;
  status: string;
  createdAt: string;
}

/**
 * Creates a new support ticket.
 *
 * Error Mappings (Hinglish INVARIANT-UX-7):
 * - INVALID_SUBJECT: "Kripya sahi sawaal ka type chunein"
 * - MESSAGE_TOO_SHORT: "Message kam se kam 20 characters ka hona chahiye"
 * - UPLOAD_FAILED: "Screenshot upload nahi ho paya"
 * - DEFAULT: "Ticket raise nahi ho payi. Kripya thodi der baad try karein."
 */
export async function submitSupportTicket(
  payload: CreateSupportTicketPayload,
  token: string
): Promise<ApiResult<SupportTicketResponse>> {
  return apiPost<SupportTicketResponse>("api/v1/support/ticket", token, payload);
}
