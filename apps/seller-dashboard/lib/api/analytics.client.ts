import { apiGet, ApiResult } from "./client";

export interface AnalyticsSummaryViewModel {
  totalRevenue: number;
  orderCount: number;
  avgOrderValue: number;
  maxOrderValue: number;
}

export interface RevenueTrendViewModel {
  date: string;
  revenue: number;
  orders: number;
}

export interface OrderDistributionViewModel {
  status: string;
  count: number;
}

export interface TopProductViewModel {
  id: string;
  name: string;
  sku: string;
  thumbnailUrl: string;
  segment: string;
  orders: number;
  revenue: number;
}

export interface AnalyticsResponseDto {
  summary: AnalyticsSummaryViewModel;
  revenueTrend: RevenueTrendViewModel[];
  orderDistribution: OrderDistributionViewModel[];
  topProducts: TopProductViewModel[];
}

/**
 * Get Analytics Batch Data
 * As per §13.21: single GET /seller/analytics?from={}&to={}
 */
export async function getAnalyticsData(
  token: string,
  from: string,
  to: string,
): Promise<ApiResult<AnalyticsResponseDto>> {
  return apiGet<AnalyticsResponseDto>(
    `/seller/analytics?from=${from}&to=${to}`,
    token,
  );
}
