/**
 * Dashboard API Client — apps/seller-dashboard/lib/api/dashboard.client.ts
 *
 * Authority: seller_dashboard_architecture.md §7, §8
 * Endpoints: ✅ Both confirmed in backend
 *
 * APIs:
 *   GET /seller/dashboard/kpis   → SellerKpiDto
 *   GET /seller/scorecard        → SellerScorecardDto
 */

import { apiGet, type ApiResult } from './client';

/* ── DTOs (from architecture §7) ────────────────────────────── */
export interface SellerKpiDto {
  ordersToday: number;
  revenueToday: string;    // Decimal string — parse with parseFloat before display
  revenueTodayVsYesterday?: number; // UI Extension
  pendingOrders: number;
  oldestPendingDuration?: string; // UI Extension: e.g., '5 hrs'
  lowStock: number;
  outOfStock?: number; // UI Extension
  isCacheBypass: boolean;
  cachedAt: string | null;
}

export interface SellerScorecardDto {
  score: number;           // 0–100
  trend: 'UP' | 'DOWN' | 'STABLE';
  narrative: string;       // Hinglish narrative string from backend
  breakdown?: {
    orderFulfillment: number;
    returnRate: number;
    responseTime: number;
  };
}

/* ── API FUNCTIONS ───────────────────────────────────────────── */

/**
 * Fetch seller KPI cards.
 * Used in: Dashboard Home (§01 KPI Row — 4 cards)
 * Also used by: Sidebar badge counts (pendingOrders, lowStock)
 * Parallel fetch: Always call alongside getScorecard and getRecentOrders (never sequential)
 * Authority: architecture §7 "Dashboard Multi-API Fetch Pattern (ARCH-REV-SD-14 RESOLVED)"
 */
export async function getKpis(token: string): Promise<ApiResult<SellerKpiDto>> {
  return apiGet<SellerKpiDto>('/seller/dashboard/kpis', token);
}

/**
 * Fetch seller scorecard.
 * Used in: Dashboard Home (§01 Scorecard Panel)
 * Partial render: If this fails, scorecard panel hidden — dashboard does NOT crash.
 * Authority: architecture §7 "PARTIAL RENDER POLICY (ARCH-REV-SD-5 RESOLVED)"
 */
export async function getScorecard(token: string): Promise<ApiResult<SellerScorecardDto>> {
  return apiGet<SellerScorecardDto>('/seller/scorecard', token);
}

/* ── RECENT ORDERS PREVIEW ──────────────────────────────────── */

export interface RecentOrderPreviewDto {
  id: string;
  orderNumber: string;
  buyerName: string;
  totalAmount: number;
  status: 'PLACED' | 'CONFIRMED' | 'SHIPPED' | 'COMPLETED' | 'CANCELLED';
  createdAt: string;
}

/**
 * Fetch recent orders for preview (max 5)
 * API: GET /seller/orders?limit=5
 */
export async function getRecentOrders(token: string): Promise<ApiResult<{ items: RecentOrderPreviewDto[] }>> {
  return apiGet<{ items: RecentOrderPreviewDto[] }>('/seller/orders?limit=5', token);
}
