import { apiGet, apiPatch, ApiResult } from './client';

export type OrderStatus = 
  | 'PLACED' 
  | 'CONFIRMED' 
  | 'PROCESSING' 
  | 'SHIPPED' 
  | 'DELIVERED' 
  | 'COMPLETED' 
  | 'CANCELLED'
  | 'PAYMENT_FAILED'
  | 'RETURN_INITIATED'
  | 'REFUND_INITIATED'
  | 'DISPUTE_OPEN'
  | 'DISPUTE_RESOLVED';

export interface OrderPreviewDto {
  id: string;
  orderNumber: string;
  buyerName: string;
  amount: string;
  itemCount: number;
  status: OrderStatus;
  createdAt: string;
  segment: string;
}

export interface OrderListResponseDto {
  data: OrderPreviewDto[];
  nextCursor: string | null;
  totalCount: number;
  counts: Record<OrderStatus | 'ALL', number>;
}

export interface GetOrdersParams {
  cursor?: string | null;
  limit?: number;
  status?: OrderStatus | 'ALL';
  search?: string;
  sort?: 'amount' | 'created_at';
  dir?: 'asc' | 'desc';
}

export async function getOrders(params: GetOrdersParams, token: string): Promise<ApiResult<OrderListResponseDto>> {
  const query = new URLSearchParams();
  if (params.cursor) query.append('cursor', params.cursor);
  if (params.limit) query.append('limit', params.limit.toString());
  if (params.status && params.status !== 'ALL') query.append('status', params.status);
  if (params.search) query.append('search', params.search);
  if (params.sort) query.append('sort', params.sort);
  if (params.dir) query.append('dir', params.dir);

  return apiGet<OrderListResponseDto>(`/seller/orders?${query.toString()}`, token);
}

export async function confirmOrder(id: string, token: string): Promise<ApiResult<void>> {
  return apiPatch<void>(`/seller/orders/${id}/confirm`, token, undefined);
}

export interface ShipOrderPayload {
  carrier: string;
  trackingNumber: string;
  shipDate: string;
}

export async function shipOrder(id: string, payload: ShipOrderPayload, token: string): Promise<ApiResult<void>> {
  return apiPatch<void>(`/seller/orders/${id}/ship`, token, payload);
}
