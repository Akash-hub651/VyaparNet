/**
 * Addresses API Client — apps/web/lib/api/addresses.client.ts
 *
 * Exposes methods to query and create user addresses.
 * Returns { data, error } discriminated union — NEVER throws.
 */

import { CreateAddressDto, AddressType } from '@vyaparnet/types';
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

export async function getAddresses(
  token: string,
): Promise<ApiResult<AddressType[]>> {
  try {
    const url = `${getApiBaseUrl()}/api/v1/users/addresses`;
    const res = await fetch(url, {
      headers: buildAuthHeaders(token),
      cache: 'no-store',
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { message?: string };
      return { data: null, error: { message: err.message ?? res.statusText, status: res.status } };
    }

    const json = await res.json() as { success: boolean; data: AddressType[] };
    return { data: json.data, error: null };
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : 'Failed to fetch addresses' } };
  }
}

export async function createAddress(
  dto: CreateAddressDto,
  token: string,
): Promise<ApiResult<AddressType>> {
  try {
    const url = `${getApiBaseUrl()}/api/v1/users/addresses`;
    const res = await fetch(url, {
      method: 'POST',
      headers: buildAuthHeaders(token),
      body: JSON.stringify(dto),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { message?: string };
      return { data: null, error: { message: err.message ?? res.statusText, status: res.status } };
    }

    const json = await res.json() as { success: boolean; data: AddressType };
    return { data: json.data, error: null };
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : 'Failed to create address' } };
  }
}
