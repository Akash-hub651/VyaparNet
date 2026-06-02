/**
 * Admin API Client — Phase 15
 *
 * All requests go through httpOnly cookie-based auth (FOOTGUN-15-B: no localStorage).
 * The admin JWT cookie is set by the API server on login.
 * All state-mutating requests include Idempotency-Key (INV-S7-7).
 */

// In the browser, we use relative paths to hit the Next.js rewrites.
// On the server, we would need the absolute URL of the NestJS API.
const API_BASE = typeof window !== 'undefined' 
  ? '' 
  : (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3003/api/v1');

class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function apiFetch<T>(
  path: string,
  options: RequestInit & { idempotencyKey?: string } = {},
): Promise<T> {
  const { idempotencyKey, ...fetchOptions } = options;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(fetchOptions.headers as Record<string, string> | undefined),
  };
  if (idempotencyKey) {
    headers['Idempotency-Key'] = idempotencyKey;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...fetchOptions,
    credentials: 'include', // httpOnly cookie — FOOTGUN-15-B
    headers,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    throw new ApiError(
      res.status,
      body.code ?? 'UNKNOWN',
      body.message ?? res.statusText,
    );
  }

  // 204 No Content — return empty
  if (res.status === 204) return {} as T;
  return res.json() as Promise<T>;
}

// ─── Auth ──────────────────────────────────────────────────────────────────

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: string;
}

export async function adminLogin(email: string, password: string): Promise<AdminUser> {
  return apiFetch<AdminUser>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function adminLogout(): Promise<void> {
  await apiFetch('/auth/logout', { method: 'POST' });
}

export async function getAdminMe(): Promise<AdminUser> {
  return apiFetch<AdminUser>('/auth/me');
}

// ─── Businesses / KYC ─────────────────────────────────────────────────────

export interface BusinessListItem {
  id: string;
  name: string;
  gstin: string;
  segment: string;
  kycStatus: string;
  ownerName: string;
  ownerPhone: string;
  createdAt: string;
}

export interface BusinessListResponse {
  data: BusinessListItem[];
  total: number;
  page: number;
  limit: number;
}

export async function listBusinesses(params: {
  page?: number;
  limit?: number;
  kycStatus?: string;
  segment?: string;
  search?: string;
}): Promise<BusinessListResponse> {
  const q = new URLSearchParams();
  if (params.page) q.set('page', String(params.page));
  if (params.limit) q.set('limit', String(params.limit));
  if (params.kycStatus) q.set('kycStatus', params.kycStatus);
  if (params.segment) q.set('segment', params.segment);
  if (params.search) q.set('search', params.search);
  return apiFetch<BusinessListResponse>(`/admin/businesses?${q}`);
}

export interface BusinessDetail extends BusinessListItem {
  ownerEmail: string;
  address: Record<string, string>;
  kycDocuments: KycDocument[];
}

export interface KycDocument {
  id: string;
  type: string;
  status: string;
  signedUrl?: string;
}

export async function getBusinessDetail(id: string): Promise<BusinessDetail> {
  return apiFetch<BusinessDetail>(`/admin/businesses/${id}`);
}

export async function verifyBusiness(
  id: string,
  idempotencyKey: string,
): Promise<BusinessDetail> {
  return apiFetch<BusinessDetail>(`/admin/businesses/${id}/verify`, {
    method: 'PATCH',
    idempotencyKey,
  });
}

export async function rejectBusiness(
  id: string,
  reason: string,
  idempotencyKey: string,
): Promise<BusinessDetail> {
  return apiFetch<BusinessDetail>(`/admin/businesses/${id}/reject`, {
    method: 'PATCH',
    body: JSON.stringify({ reason }),
    idempotencyKey,
  });
}

export async function suspendBusiness(
  id: string,
  reason: string,
  idempotencyKey: string,
): Promise<BusinessDetail> {
  return apiFetch<BusinessDetail>(`/admin/businesses/${id}/suspend`, {
    method: 'PATCH',
    body: JSON.stringify({ reason }),
    idempotencyKey,
  });
}

// ─── Products ─────────────────────────────────────────────────────────────

export interface ProductListItem {
  id: string;
  name: string;
  sellerName: string;
  segment: string;
  status: string;
  price: string;
  createdAt: string;
}

export interface ProductListResponse {
  data: ProductListItem[];
  total: number;
  page: number;
  limit: number;
}

export async function listProducts(params: {
  page?: number;
  limit?: number;
  status?: string;
  segment?: string;
}): Promise<ProductListResponse> {
  const q = new URLSearchParams();
  if (params.page) q.set('page', String(params.page));
  if (params.limit) q.set('limit', String(params.limit));
  if (params.status) q.set('status', params.status);
  if (params.segment) q.set('segment', params.segment);
  return apiFetch<ProductListResponse>(`/admin/products?${q}`);
}

export async function approveProduct(
  id: string,
  idempotencyKey: string,
): Promise<void> {
  return apiFetch(`/admin/products/${id}/approve`, {
    method: 'PATCH',
    idempotencyKey,
  });
}

export async function rejectProduct(
  id: string,
  reason: string,
  idempotencyKey: string,
): Promise<void> {
  return apiFetch(`/admin/products/${id}/reject`, {
    method: 'PATCH',
    body: JSON.stringify({ reason }),
    idempotencyKey,
  });
}

export async function bulkApproveProducts(
  productIds: string[],
  idempotencyKey: string,
): Promise<{ approved: number; failed: number }> {
  return apiFetch('/admin/products/bulk-approve', {
    method: 'POST',
    body: JSON.stringify({ productIds }),
    idempotencyKey,
  });
}

// ─── Users ────────────────────────────────────────────────────────────────

export interface UserListItem {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  isDeleted: boolean;
  createdAt: string;
}

export interface UserListResponse {
  data: UserListItem[];
  total: number;
  page: number;
  limit: number;
}

export async function listUsers(params: {
  page?: number;
  limit?: number;
  role?: string;
  search?: string;
  isDeleted?: boolean;
}): Promise<UserListResponse> {
  const q = new URLSearchParams();
  if (params.page) q.set('page', String(params.page));
  if (params.limit) q.set('limit', String(params.limit));
  if (params.role) q.set('role', params.role);
  if (params.search) q.set('search', params.search);
  if (params.isDeleted !== undefined) q.set('isDeleted', String(params.isDeleted));
  return apiFetch<UserListResponse>(`/admin/users?${q}`);
}

export async function getUser(id: string): Promise<UserListItem> {
  return apiFetch<UserListItem>(`/admin/users/${id}`);
}

export async function suspendUser(
  id: string,
  reason: string,
  idempotencyKey: string,
): Promise<void> {
  return apiFetch(`/admin/users/${id}/suspend`, {
    method: 'PATCH',
    body: JSON.stringify({ reason }),
    idempotencyKey,
  });
}

export async function changeUserRole(
  id: string,
  role: 'BUYER' | 'SELLER',
  idempotencyKey: string,
): Promise<void> {
  return apiFetch(`/admin/users/${id}/role`, {
    method: 'PATCH',
    body: JSON.stringify({ role }),
    idempotencyKey,
  });
}

// ─── Orders ───────────────────────────────────────────────────────────────

export interface OrderListItem {
  id: string;
  orderNumber: string;
  buyerName: string;
  sellerName: string;
  segment: string;
  status: string;
  grandTotal: string;
  paymentMethod: string;
  createdAt: string;
}

export interface OrderListResponse {
  data: OrderListItem[];
  total: number;
  page: number;
  limit: number;
}

export async function listOrders(params: {
  page?: number;
  limit?: number;
  status?: string;
  segment?: string;
  search?: string;
}): Promise<OrderListResponse> {
  const q = new URLSearchParams();
  if (params.page) q.set('page', String(params.page));
  if (params.limit) q.set('limit', String(params.limit));
  if (params.status) q.set('status', params.status);
  if (params.segment) q.set('segment', params.segment);
  if (params.search) q.set('search', params.search);
  return apiFetch<OrderListResponse>(`/admin/orders?${q}`);
}

export interface OrderDetail extends OrderListItem {
  buyerPhone: string;
  sellerGstin: string;
  shippingAddress: Record<string, string>;
  items: Array<{ productName: string; quantity: number; unitPrice: string; totalPrice: string }>;
  statusHistory: Array<{ status: string; actorRole: string; createdAt: string; note?: string }>;
}

export async function getOrderDetail(id: string): Promise<OrderDetail> {
  return apiFetch<OrderDetail>(`/admin/orders/${id}`);
}

export async function deliverOrder(
  id: string,
  idempotencyKey: string,
): Promise<void> {
  return apiFetch(`/admin/orders/${id}/deliver`, {
    method: 'PATCH',
    idempotencyKey,
  });
}

export async function completeOrder(
  id: string,
  idempotencyKey: string,
): Promise<void> {
  return apiFetch(`/admin/orders/${id}/complete`, {
    method: 'PATCH',
    idempotencyKey,
  });
}

export async function cancelOrder(
  id: string,
  reason: string,
  idempotencyKey: string,
): Promise<void> {
  return apiFetch(`/admin/orders/${id}/cancel`, {
    method: 'PATCH',
    body: JSON.stringify({ reason }),
    idempotencyKey,
  });
}

// ─── Payouts ──────────────────────────────────────────────────────────────

export interface PayoutListItem {
  id: string;
  sellerName: string;
  orderNumber: string;
  grossAmount: string;
  netPayout: string;
  platformFee: string;
  tdsAmount: string;
  status: string;
  createdAt: string;
}

export interface PayoutListResponse {
  data: PayoutListItem[];
  total: number;
  page: number;
  limit: number;
}

export async function listPayouts(params: {
  page?: number;
  limit?: number;
  status?: string;
}): Promise<PayoutListResponse> {
  const q = new URLSearchParams();
  if (params.page) q.set('page', String(params.page));
  if (params.limit) q.set('limit', String(params.limit));
  if (params.status) q.set('status', params.status);
  return apiFetch<PayoutListResponse>(`/admin/payouts?${q}`);
}

export async function initiatePayout(
  id: string,
  idempotencyKey: string,
): Promise<void> {
  return apiFetch(`/admin/payouts/${id}/initiate`, {
    method: 'PATCH',
    idempotencyKey,
  });
}

// ─── Invoices ─────────────────────────────────────────────────────────────

export interface InvoiceListItem {
  id: string;
  orderNumber: string;
  buyerName: string;
  sellerName: string;
  grandTotal: string;
  status: string;
  createdAt: string;
}

export async function listInvoices(params: {
  page?: number;
  limit?: number;
}): Promise<{ data: InvoiceListItem[]; total: number; page: number; limit: number }> {
  const q = new URLSearchParams();
  if (params.page) q.set('page', String(params.page));
  if (params.limit) q.set('limit', String(params.limit));
  return apiFetch(`/admin/invoices?${q}`);
}

export async function generateInvoice(
  orderId: string,
  idempotencyKey: string,
): Promise<{ invoiceId: string; status: 'DONE' | 'GENERATING'; url?: string }> {
  return apiFetch(`/admin/invoices/generate/${orderId}`, {
    method: 'POST',
    idempotencyKey,
  });
}

// ─── Feature Flags ────────────────────────────────────────────────────────

export interface FeatureFlag {
  id: string;
  name: string;
  description: string | null;
  enabled: boolean;           // matches FeatureFlagDto.enabled (backend)
  rolloutPercent: number;    // matches FeatureFlagDto.rolloutPercent (backend)
  segment: string | null;
  env: string;
  createdAt: string;
  updatedAt: string;
}

export async function listFlags(): Promise<FeatureFlag[]> {
  return apiFetch<FeatureFlag[]>('/admin/flags');
}

/**
 * toggleFlag — sends AdminUpdateFlagDto: { enabled, rolloutPercent? }
 * Backend: PATCH /admin/flags/:name (AdminFlagService.toggleFlag)
 * INV-S7-18: Cache invalidated via SCAN+DEL after toggle.
 */
export async function toggleFlag(
  name: string,
  enabled: boolean,
  idempotencyKey: string,
  rolloutPercent?: number,
): Promise<FeatureFlag> {
  return apiFetch<FeatureFlag>(`/admin/flags/${name}`, {
    method: 'PATCH',
    body: JSON.stringify({ enabled, ...(rolloutPercent !== undefined && { rolloutPercent }) }),
    idempotencyKey,
  });
}

/**
 * updateFlagRollout — updates rolloutPercent (numeric rate) for a flag.
 * Used for commission/TDS rate flags: platform_commission_percent, tds_rate_percent, etc.
 * Backend: PATCH /admin/flags/:name with { enabled: current, rolloutPercent: newValue }
 */
export async function updateFlagRollout(
  name: string,
  enabled: boolean,
  rolloutPercent: number,
  idempotencyKey: string,
): Promise<FeatureFlag> {
  return apiFetch<FeatureFlag>(`/admin/flags/${name}`, {
    method: 'PATCH',
    body: JSON.stringify({ enabled, rolloutPercent }),
    idempotencyKey,
  });
}

// ─── Audit Logs ───────────────────────────────────────────────────────────

export interface AuditLogEntry {
  id: string;
  actorId: string;
  actorRole: string;
  action: string;
  entityType: string;
  entityId: string;
  entityName: string;
  oldValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
  ipAddress: string;
  createdAt: string;
}

export async function listAuditLogs(params: {
  cursor?: string;
  limit?: number;
  entityType?: string;
  entityId?: string;
  actorId?: string;
  action?: string;
  dateFrom?: string;
  dateTo?: string;
}): Promise<{ data: AuditLogEntry[]; nextCursor?: string }> {
  const q = new URLSearchParams();
  if (params.cursor) q.set('cursor', params.cursor);
  if (params.limit) q.set('limit', String(params.limit));
  if (params.entityType) q.set('entityType', params.entityType);
  if (params.entityId) q.set('entityId', params.entityId);
  if (params.actorId) q.set('actorId', params.actorId);
  if (params.action) q.set('action', params.action);
  if (params.dateFrom) q.set('dateFrom', params.dateFrom);
  if (params.dateTo) q.set('dateTo', params.dateTo);
  return apiFetch(`/admin/audit-logs?${q}`);
}

// ─── Exceptions / DLQ ─────────────────────────────────────────────────────

export interface BusinessExceptions {
  stuckOrders: Array<{
    id: string;
    orderNumber: string;
    status: string;
    sellerName: string;
    updatedAt: string;
    stuckForMs: number;
  }>;
  failedPayments: Array<{
    id: string;
    orderId: string;
    orderNumber: string;
    paymentMethod: string;
    amount: string;
    failedAt: string;
  }>;
  suspendedSellersWithActiveOrders: Array<{
    businessId: string;
    businessName: string;
    activeOrderCount: number;
  }>;
  generatedAt: string;
  dlqDepth?: number;
}

export async function getExceptions(): Promise<BusinessExceptions> {
  const res = await apiFetch<{ business: Omit<BusinessExceptions, 'dlqDepth'>; technical: { dlqDepth: number } }>('/admin/exceptions');
  return {
    ...res.business,
    dlqDepth: res.technical.dlqDepth,
  };
}

// ─── Support Tickets ──────────────────────────────────────────────────────

export interface SupportTicket {
  id: string;
  subject: string;
  status: string;
  priority: string;
  reporterName: string;
  reporterRole: string;
  assigneeName?: string;
  createdAt: string;
  updatedAt: string;
}

export async function listTickets(params: {
  page?: number;
  limit?: number;
  status?: string;
  priority?: string;
}): Promise<{ data: SupportTicket[]; total: number; page: number; limit: number }> {
  const q = new URLSearchParams();
  if (params.page) q.set('page', String(params.page));
  if (params.limit) q.set('limit', String(params.limit));
  if (params.status) q.set('status', params.status);
  if (params.priority) q.set('priority', params.priority);
  return apiFetch(`/admin/tickets?${q}`);
}

export async function assignTicket(
  id: string,
  assigneeId: string,
  idempotencyKey: string,
): Promise<void> {
  return apiFetch(`/admin/tickets/${id}/assign`, {
    method: 'PATCH',
    body: JSON.stringify({ assigneeId }),
    idempotencyKey,
  });
}

export async function resolveTicket(
  id: string,
  idempotencyKey: string,
): Promise<void> {
  return apiFetch(`/admin/tickets/${id}/resolve`, {
    method: 'PATCH',
    idempotencyKey,
  });
}

export { ApiError };
