import { apiGet, apiPatch, apiPost, ApiResult } from './client';

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
  amount: string;
  itemCount: number;
  status: OrderStatus;
  createdAt: string;
  buyerName: string;
  segment: string;
}

export interface TimelineEvent {
  status: OrderStatus;
  timestamp: string;
  actor: string;
  note?: string;
}

export interface OrderItemDto {
  id: string;
  name: string;
  sku: string;
  qty: number;
  price: string;
  total: string;
  imageUrl?: string;
}

export interface OrderDetailDto {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  createdAt: string;
  segment: string;
  buyerContact: {
    name: string;
    phone: string;
    email: string;
    address: string;
  };
  items: OrderItemDto[];
  payment: {
    method: string;
    status: string;
    subtotal: string;
    tax: string;
    total: string;
    payoutStatus?: string;
    payoutDate?: string;
    payoutAmount?: string;
    platformFee?: string;
  };
  dispatch?: {
    carrier: string;
    trackingNumber: string;
    shipDate: string;
    proofUrl?: string;
  };
  timeline: TimelineEvent[];
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

// ----------------------------------------------------------------------------
// SINGLE ORDER DETAILS (SCREEN 03)
// ----------------------------------------------------------------------------

export async function getOrderById(id: string, token: string): Promise<ApiResult<OrderDetailDto>> {
  return apiGet<OrderDetailDto>(`/seller/orders/${id}`, token);
}

export async function updateOrderStatus(id: string, status: OrderStatus, token: string): Promise<ApiResult<void>> {
  return apiPatch<void>(`/seller/orders/${id}/status`, token, { status });
}

export interface UploadUrlResponse {
  uploadUrl: string;
  key: string;
}

export async function getDispatchProofUploadUrl(id: string, fileName: string, fileType: string, token: string): Promise<ApiResult<UploadUrlResponse>> {
  return apiPost<UploadUrlResponse>(`/seller/orders/${id}/dispatch-proof/upload-url`, token, { fileName, fileType });
}

export async function confirmDispatchProof(id: string, key: string, trackingInfo: ShipOrderPayload, token: string): Promise<ApiResult<void>> {
  return apiPost<void>(`/seller/orders/${id}/dispatch-proof/confirm`, token, { key, ...trackingInfo });
}
