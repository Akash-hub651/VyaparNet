/**
 * Checkout API Client — apps/web/lib/api/checkout.client.ts
 *
 * Exposes methods to place orders, initiate payments, and poll status.
 * Returns { data, error } discriminated union — NEVER throws.
 */

import { CreateOrderDto } from '@vyaparnet/types';
import { getApiBaseUrl } from '../config';

type ApiResult<T> =
  | { data: T; error: null }
  | { data: null; error: { message: string; code?: string; status?: number } };

interface OrderResponseDto {
  orderId: string;
  orderNumber: string;
  status: string;
  grandTotal: number;
  paymentMethod: string;
  paymentUrl?: string;
}

interface InitiatePaymentResponse {
  paymentId: string;
  razorpayOrderId: string;
  paymentUrl: string;
}

function buildAuthHeaders(token: string, idempotencyKey?: string, reauthToken?: string): HeadersInit {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };
  if (idempotencyKey) {
    headers['idempotency-key'] = idempotencyKey;
  }
  if (reauthToken) {
    headers['x-reauth-token'] = reauthToken;
  }
  return headers;
}

export async function createOrder(
  dto: CreateOrderDto,
  idempotencyKey: string,
  token: string,
): Promise<ApiResult<OrderResponseDto>> {
  try {
    const url = `${getApiBaseUrl()}/api/v1/orders`;
    const res = await fetch(url, {
      method: 'POST',
      headers: buildAuthHeaders(token, idempotencyKey),
      body: JSON.stringify(dto),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { message?: string; code?: string };
      return {
        data: null,
        error: { message: err.message ?? res.statusText, code: err.code, status: res.status },
      };
    }

    const json = await res.json() as { success: boolean; data: OrderResponseDto };
    return { data: json.data, error: null };
  } catch (err) {
    return {
      data: null,
      error: { message: err instanceof Error ? err.message : 'Order creation failed' },
    };
  }
}

export async function initiatePayment(
  orderId: string,
  paymentMethod: string,
  idempotencyKey: string,
  token: string,
  reauthToken?: string,
): Promise<ApiResult<InitiatePaymentResponse>> {
  try {
    const url = `${getApiBaseUrl()}/api/v1/payments/initiate`;
    const res = await fetch(url, {
      method: 'POST',
      headers: buildAuthHeaders(token, idempotencyKey, reauthToken),
      body: JSON.stringify({ orderId, paymentMethod }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { message?: string; code?: string };
      return {
        data: null,
        error: { message: err.message ?? res.statusText, code: err.code, status: res.status },
      };
    }

    const json = await res.json() as { success: boolean; data: InitiatePaymentResponse };
    return { data: json.data, error: null };
  } catch (err) {
    return {
      data: null,
      error: { message: err instanceof Error ? err.message : 'Payment initiation failed' },
    };
  }
}

export async function getPaymentStatus(
  orderId: string,
  token: string,
): Promise<ApiResult<{ status: string }>> {
  try {
    const url = `${getApiBaseUrl()}/api/v1/payments/${orderId}/status`;
    const res = await fetch(url, {
      headers: buildAuthHeaders(token),
      cache: 'no-store',
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { message?: string };
      return { data: null, error: { message: err.message ?? res.statusText, status: res.status } };
    }

    const json = await res.json() as { success: boolean; data: { status: string } };
    return { data: json.data, error: null };
  } catch (err) {
    return {
      data: null,
      error: { message: err instanceof Error ? err.message : 'Failed to query payment status' },
    };
  }
}
