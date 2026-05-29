/**
 * Cart API Client — apps/web/lib/api/cart.client.ts
 *
 * Exposes methods to query and mutate the active user cart.
 * All mutations invalidate the Redis display cache immediately.
 * Returns { data, error } discriminated union — NEVER throws.
 */

import { Segment, AddToCartDto, CartType, CartItemType } from '@vyaparnet/types';
import { getApiBaseUrl } from '../config';

type ApiResult<T> =
  | { data: T; error: null }
  | { data: null; error: { message: string; status?: number } };

function buildAuthHeaders(token: string): HeadersInit {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };
}

export async function getCart(
  segment: Segment,
  token: string,
): Promise<ApiResult<CartType>> {
  try {
    const url = `${getApiBaseUrl()}/api/v1/cart?segment=${segment}`;
    const res = await fetch(url, {
      headers: buildAuthHeaders(token),
      cache: 'no-store',
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { message?: string };
      return { data: null, error: { message: err.message ?? res.statusText, status: res.status } };
    }

    const json = await res.json() as { success: boolean; data: CartType };
    return { data: json.data, error: null };
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : 'Failed to fetch cart' } };
  }
}

export async function addToCart(
  dto: AddToCartDto,
  token: string,
): Promise<ApiResult<CartItemType>> {
  try {
    const url = `${getApiBaseUrl()}/api/v1/cart/items`;
    const res = await fetch(url, {
      method: 'POST',
      headers: buildAuthHeaders(token),
      body: JSON.stringify(dto),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { message?: string; code?: string };
      return { data: null, error: { message: err.message ?? res.statusText, status: res.status } };
    }

    const json = await res.json() as { success: boolean; data: CartItemType };
    return { data: json.data, error: null };
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : 'Failed to add item to cart' } };
  }
}

export async function updateCartItem(
  productId: string,
  segment: Segment,
  quantity: number,
  token: string,
): Promise<ApiResult<void>> {
  try {
    const url = `${getApiBaseUrl()}/api/v1/cart/items/${productId}?segment=${segment}`;
    const res = await fetch(url, {
      method: 'PUT',
      headers: buildAuthHeaders(token),
      body: JSON.stringify({ quantity }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { message?: string };
      return { data: null, error: { message: err.message ?? res.statusText, status: res.status } };
    }

    return { data: undefined, error: null };
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : 'Failed to update cart item' } };
  }
}

export async function removeFromCart(
  productId: string,
  segment: Segment,
  token: string,
): Promise<ApiResult<void>> {
  try {
    const url = `${getApiBaseUrl()}/api/v1/cart/items/${productId}?segment=${segment}`;
    const res = await fetch(url, {
      method: 'DELETE',
      headers: buildAuthHeaders(token),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { message?: string };
      return { data: null, error: { message: err.message ?? res.statusText, status: res.status } };
    }

    return { data: undefined, error: null };
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : 'Failed to remove cart item' } };
  }
}
