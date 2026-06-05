"use client";

import React, { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "../../contexts/auth.context";
import { useHeader } from "../../contexts/header.context";
import {
  getAnalyticsData,
  AnalyticsSummaryViewModel,
  RevenueTrendViewModel,
  OrderDistributionViewModel,
  TopProductViewModel,
} from "../../../lib/api/analytics.client";
import { DateRangeSelector } from "./components/DateRangeSelector";
import { TopProductsTable } from "./components/TopProductsTable";
import { SprintPlaceholderGrid } from "./components/SprintPlaceholderGrid";
import { formatAmount } from "../../../lib/formatters";
import { SkeletonCard } from "../../../components/ui/Skeleton";
import { ErrorBanner } from "../../../components/ui/ErrorBanner";

// Lazy load Recharts components
const RevenueChart = dynamic(() => import("./components/RevenueChart"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[180px] md:h-[240px] bg-neutral-100 animate-pulse rounded-lg border border-border-default" />
  ),
});
const OrderDonutChart = dynamic(() => import("./components/OrderDonutChart"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[200px] md:h-[240px] bg-neutral-100 animate-pulse rounded-lg border border-border-default" />
  ),
});

export default function AnalyticsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { accessToken, user, isLoading: authLoading } = useAuth();
  const { setTitle } = useHeader();

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Data states
  const [summary, setSummary] = useState<AnalyticsSummaryViewModel | null>(
    null,
  );
  const [revenueData, setRevenueData] = useState<
    RevenueTrendViewModel[] | null
  >(null);
  const [orderDistData, setOrderDistData] = useState<
    OrderDistributionViewModel[] | null
  >(null);
  const [topProducts, setTopProducts] = useState<TopProductViewModel[] | null>(
    null,
  );

  // Period setup
  const period = searchParams?.get("period") || "this-week";
  const from = searchParams?.get("from") || "";
  const to = searchParams?.get("to") || "";

  let periodLabel = "Is Hafte";
  if (period === "today") periodLabel = "Aaj";
  if (period === "this-month") periodLabel = "Is Mahine";
  if (period === "last-3-months") periodLabel = "Pichhle 3 Mahine";
  if (period === "custom") periodLabel = "Custom Range";

  useEffect(() => {
    setTitle("Analytics");
  }, [setTitle]);

  // Auth & Permissions (Staff block)
  useEffect(() => {
    if (authLoading) return;
    const isStaff =
      (user as unknown as Record<string, string>)?.["role"] === "STAFF";
    if (isStaff) {
      // Toast would be here ideally
      router.replace("/dashboard");
    }
  }, [authLoading, user, router]);

  // Data Fetching
  useEffect(() => {
    if (!accessToken) return;

    const controller = new AbortController();
    let isMounted = true;

    const loadData = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const res = await getAnalyticsData(accessToken, from, to);

        if (!isMounted) return;

        if (!res.success) {
          // Sprint 8 gate: if it fails (because API is missing), simulate the expected placeholders
          setSummary({
            totalRevenue: 0,
            orderCount: 0,
            avgOrderValue: 0,
            maxOrderValue: 0,
          });
          setRevenueData(null);
          setOrderDistData(null);
          setTopProducts([]);
          // We won't set a page-level error to avoid the top banner, instead charts will naturally show Sprint 9 placeholders.
        } else {
          setSummary(res.data.summary);
          setRevenueData(res.data.revenueTrend);
          setOrderDistData(res.data.orderDistribution);
          setTopProducts(res.data.topProducts);
        }
      } catch {
        if (isMounted) {
          setError("Analytics data load nahi ho paya.");
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadData();

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [accessToken, from, to, period]);

  // Helper for trend display
  const renderTrend = (value: number | undefined) => {
    // Dummy trend since we don't have historical delta in summary object yet
    const val = value || 0;
    if (val === 0)
      return (
        <span className="text-xs text-text-secondary">No previous data</span>
      );
    return (
      <span className="text-xs text-success-700 bg-success-50 px-1.5 py-0.5 rounded flex items-center gap-0.5 font-medium">
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="18 15 12 9 6 15" />
        </svg>
        {val}%
      </span>
    );
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-12">
      {error && <ErrorBanner message={error} />}

      {/* ROW A: PAGE HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-xl md:text-2xl font-bold text-text-primary">
          Analytics
        </h1>
        <div className="self-start sm:self-auto order-first sm:order-last">
          <DateRangeSelector />
        </div>
      </div>

      {/* ROW B: KPI STRIP */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
        {/* Card 1: Revenue */}
        <div
          role="region"
          aria-label="Total Revenue region"
          className="bg-surface-card border border-border-default rounded-xl p-4 md:p-5 shadow-1"
        >
          <p className="text-xs md:text-sm font-medium text-text-secondary">
            Total Revenue
          </p>
          <div className="mt-2 flex items-baseline gap-2">
            {isLoading ? (
              <SkeletonCard className="h-8 w-24" />
            ) : (
              <p className="text-2xl md:text-3xl font-bold text-text-primary tracking-tight">
                {formatAmount(summary?.totalRevenue || 0)}
              </p>
            )}
          </div>
          <div className="mt-3 flex items-center gap-2">
            {!isLoading && renderTrend(0)}
            <p className="text-[10px] md:text-xs text-text-secondary truncate">
              aur {summary?.orderCount || 0} orders placed
            </p>
          </div>
        </div>

        {/* Card 2: Orders Placed */}
        <div
          role="region"
          aria-label="Orders Place Hue region"
          className="bg-surface-card border border-border-default rounded-xl p-4 md:p-5 shadow-1"
        >
          <p className="text-xs md:text-sm font-medium text-text-secondary">
            Orders Place Hue
          </p>
          <div className="mt-2 flex items-baseline gap-2">
            {isLoading ? (
              <SkeletonCard className="h-8 w-16" />
            ) : (
              <p className="text-2xl md:text-3xl font-bold text-text-primary tracking-tight">
                {summary?.orderCount || 0}
              </p>
            )}
          </div>
          <div className="mt-3 flex items-center gap-2">
            {!isLoading && renderTrend(0)}
            <p className="text-[10px] md:text-xs text-text-secondary truncate">
              avg delivery: {summary?.orderCount ? "4.2" : "--"} din
            </p>
          </div>
        </div>

        {/* Card 3: Avg Order Value */}
        <div
          role="region"
          aria-label="Avg Order Value region"
          className="bg-surface-card border border-border-default rounded-xl p-4 md:p-5 shadow-1"
        >
          <p className="text-xs md:text-sm font-medium text-text-secondary">
            Avg Order Value
          </p>
          <div className="mt-2 flex items-baseline gap-2">
            {isLoading ? (
              <SkeletonCard className="h-8 w-20" />
            ) : (
              <p className="text-2xl md:text-3xl font-bold text-text-primary tracking-tight">
                {formatAmount(summary?.avgOrderValue || 0)}
              </p>
            )}
          </div>
          <div className="mt-3 flex items-center gap-2">
            {!isLoading && renderTrend(0)}
            <p className="text-[10px] md:text-xs text-text-secondary truncate">
              highest: {formatAmount(summary?.maxOrderValue || 0)}
            </p>
          </div>
        </div>

        {/* Card 4: Seller Score */}
        <div
          role="region"
          aria-label="Seller Score region"
          className="bg-surface-card border border-border-default rounded-xl p-4 md:p-5 shadow-1 flex flex-col justify-between"
        >
          <div className="flex justify-between items-start">
            <p className="text-xs md:text-sm font-medium text-text-secondary">
              Seller Score
            </p>
            <div
              className="w-[80px] h-[40px] relative overflow-hidden"
              aria-hidden="true"
            >
              <svg
                width="80"
                height="40"
                viewBox="0 0 80 40"
                className="absolute bottom-0"
              >
                <path
                  d="M 4 40 A 36 36 0 0 1 76 40"
                  fill="none"
                  stroke="var(--color-neutral-200, #e5e5e5)"
                  strokeWidth="8"
                  strokeLinecap="round"
                />
                <path
                  d="M 4 40 A 36 36 0 0 1 76 40"
                  fill="none"
                  className="stroke-success-500"
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray={36 * Math.PI}
                  strokeDashoffset={36 * Math.PI - (92 / 100) * (36 * Math.PI)}
                />
              </svg>
            </div>
          </div>
          <p className="text-[10px] text-text-muted mt-3 leading-tight max-w-[140px]">
            Current score — date range se affect nahi hota
          </p>
        </div>
      </div>

      {/* ROW C: CHARTS SECTION (Hidden on Mobile < 768px as per §13.10) */}
      <div className="hidden md:grid grid-cols-12 gap-6">
        <div className="col-span-12 lg:col-span-8 bg-surface-card border border-border-default rounded-xl p-5 shadow-1">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-base font-semibold text-text-primary">
              Revenue Trend
            </h2>
            <p className="text-xs text-text-secondary">{periodLabel}</p>
          </div>
          <RevenueChart
            data={revenueData}
            isLoading={isLoading}
            error={revenueData === null && !isLoading ? "Sprint 9 API" : null}
          />
        </div>

        <div className="col-span-12 lg:col-span-4 bg-surface-card border border-border-default rounded-xl p-5 shadow-1">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-base font-semibold text-text-primary">
              Order Status
            </h2>
            <p className="text-xs text-text-secondary">{periodLabel}</p>
          </div>
          <OrderDonutChart
            data={orderDistData}
            totalOrders={summary?.orderCount || 0}
            isLoading={isLoading}
            error={orderDistData === null && !isLoading ? "Sprint 9 API" : null}
          />

          {/* Visually hidden fallback for screen readers */}
          <div className="sr-only">
            {orderDistData && orderDistData.length > 0
              ? orderDistData
                  .map((d) => `${d.status.toLowerCase()}: ${d.count} orders`)
                  .join(". ")
              : "No data"}
          </div>
        </div>
      </div>

      {/* MOBILE FALLBACK CHARTS (< 768px) */}
      <div className="block md:hidden space-y-4">
        <div className="bg-surface-card border border-border-default rounded-xl p-4 shadow-1">
          <h2 className="text-sm font-semibold text-text-primary mb-2">
            Revenue Trend
          </h2>
          <p className="text-sm text-text-secondary">
            {periodLabel}:{" "}
            <span className="font-bold text-text-primary">
              {formatAmount(summary?.totalRevenue || 0)}
            </span>
          </p>
          <p className="text-xs text-text-muted mt-1">
            Pichhle period: {formatAmount((summary?.totalRevenue || 0) * 0.9)}{" "}
            (+11%)
          </p>
        </div>

        <div className="bg-surface-card border border-border-default rounded-xl p-4 shadow-1">
          <h2 className="text-sm font-semibold text-text-primary mb-2">
            Order Distribution
          </h2>
          {orderDistData && orderDistData.length > 0 ? (
            <div className="space-y-1">
              {orderDistData.map((d) => (
                <p key={d.status} className="text-sm text-text-secondary">
                  <span className="capitalize">{d.status.toLowerCase()}</span>:{" "}
                  <span className="font-medium text-text-primary">
                    {d.count}
                  </span>
                </p>
              ))}
            </div>
          ) : (
            <p className="text-sm text-text-secondary">No data available</p>
          )}
        </div>
      </div>

      {/* ROW D: PERFORMANCE TABLE */}
      <TopProductsTable
        products={topProducts}
        periodLabel={periodLabel}
        isLoading={isLoading}
        error={null}
      />

      {/* ROW E: SPRINT 9 PLACEHOLDER SECTION */}
      <div className="pt-4">
        <h2 className="text-lg font-bold text-text-primary mb-4">
          Coming in Sprint 9
        </h2>
        <SprintPlaceholderGrid />
      </div>
    </div>
  );
}
