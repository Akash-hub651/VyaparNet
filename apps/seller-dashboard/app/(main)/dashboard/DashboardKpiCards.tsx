"use client";

import React from "react";
import {
  DollarSign,
  Clock,
  ShoppingCart,
  AlertTriangle,
  Layers,
  Star,
} from "lucide-react";
import { LineChart, Line, ResponsiveContainer, YAxis } from "recharts";
import { formatAmount } from "../../../lib/formatters";
import type {
  SellerKpiDto,
  SellerScorecardDto,
} from "../../../lib/api/dashboard.client";
import { Skeleton } from "../../../components/ui/Skeleton";

interface DashboardKpiCardsProps {
  data?: SellerKpiDto;
  scoreData?: SellerScorecardDto;
  isLoading: boolean;
}

export function DashboardKpiCards({
  data,
  scoreData,
  isLoading,
}: DashboardKpiCardsProps): React.JSX.Element {
  if (isLoading || !data) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="h-24 sm:h-[120px] p-5 bg-surface-card border border-border-default rounded-lg shadow-1 flex flex-col justify-between"
          >
            <Skeleton className="w-24 h-4 mb-4" />
            <Skeleton className="w-32 h-8 mb-2" />
            <Skeleton className="w-16 h-3" />
          </div>
        ))}
      </div>
    );
  }

  // Card 1 Revenue
  const sparklineData = [
    10,
    20,
    15,
    25,
    22,
    30,
    parseFloat(data.revenueToday) || 0,
  ].map((val, i) => ({ day: i, value: val }));
  const trendVal = data.revenueTodayVsYesterday ?? 0;

  // Card 2 Pending Orders
  const isPendingWarning = data.pendingOrders > 0;
  // If > 4 hrs or manually flagged in duration
  const isPendingError = data.oldestPendingDuration
    ? data.oldestPendingDuration.includes("hr") &&
      parseInt(data.oldestPendingDuration) >= 4
    : false;
  let pendingBorder = "border-border-default";
  if (isPendingError) pendingBorder = "border-error-500 border-2";
  else if (isPendingWarning) pendingBorder = "border-warning-500 border-2";

  // Card 3 Low Stock
  const isLowStockWarning = data.lowStock > 0;
  const isOutOfStockError = (data.outOfStock ?? 0) > 0;
  let stockBorder = "border-border-default";
  if (isOutOfStockError) stockBorder = "border-error-500 border-2";
  else if (isLowStockWarning) stockBorder = "border-warning-500 border-2";

  // Card 4 Score Gauge logic
  const score = scoreData ? scoreData.score : 0;
  const percentage = Math.min(Math.max(score, 0), 100);
  const r = 36; // 80px wide -> radius = 36 approx to fit stroke
  const strokeDasharray = r * Math.PI;
  const strokeDashoffset =
    strokeDasharray - (percentage / 100) * strokeDasharray;

  let scoreColor = "stroke-success-500";
  if (score < 40) scoreColor = "stroke-error-500";
  else if (score < 70) scoreColor = "stroke-warning-500";

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      {/* 1. Revenue Today */}
      <div className="relative h-24 sm:h-[120px] p-5 bg-surface-card border border-border-default rounded-lg shadow-1 overflow-hidden flex flex-col justify-between">
        <div className="flex items-center gap-2 relative z-10">
          <DollarSign className="text-brand-600" size={16} />
          <span className="text-xs font-medium text-text-secondary uppercase tracking-wider">
            Revenue Today
          </span>
        </div>
        <div className="relative z-10">
          <div className="text-3xl font-bold text-text-primary tabular-nums">
            {formatAmount(parseFloat(data.revenueToday) || 0)}
          </div>
          <div
            className={`text-xs font-medium mt-1 ${trendVal >= 0 ? "text-success-700" : "text-error-700"}`}
          >
            {trendVal >= 0 ? "↑ +" : "↓ "}
            {Math.abs(trendVal)}% vs kal
          </div>
        </div>
        <div
          className="hidden sm:block absolute bottom-0 right-0 left-0 h-12 opacity-30 pointer-events-none"
          aria-hidden="true"
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={sparklineData}>
              <YAxis domain={["dataMin", "dataMax"]} hide />
              <Line
                type="monotone"
                dataKey="value"
                stroke="var(--color-brand-500, #3b82f6)"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 2. Pending Orders */}
      <div
        className={`h-24 sm:h-[120px] p-5 bg-surface-card border rounded-lg shadow-1 flex flex-col justify-between ${pendingBorder}`}
      >
        <div className="flex items-center gap-2">
          {data.pendingOrders > 0 ? (
            <Clock className="text-warning-500" size={16} />
          ) : (
            <ShoppingCart className="text-brand-600" size={16} />
          )}
          <span className="text-xs font-medium text-text-secondary uppercase tracking-wider">
            Pending Orders
          </span>
        </div>
        <div>
          <div className="text-3xl font-bold text-text-primary tabular-nums">
            {data.pendingOrders}
          </div>
          {data.pendingOrders === 0 ? (
            <div className="text-xs text-text-secondary mt-1">
              Naye orders aane ka wait hai
            </div>
          ) : (
            <div className="text-xs text-warning-700 mt-1">
              oldest: {data.oldestPendingDuration || "1 hr"}
            </div>
          )}
        </div>
      </div>

      {/* 3. Low Stock Products */}
      <div
        className={`h-24 sm:h-[120px] p-5 bg-surface-card border rounded-lg shadow-1 flex flex-col justify-between group ${stockBorder}`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {data.lowStock > 0 ? (
              <AlertTriangle className="text-warning-500" size={16} />
            ) : (
              <Layers className="text-success-500" size={16} />
            )}
            <span className="text-xs font-medium text-text-secondary uppercase tracking-wider">
              Low Stock Products
            </span>
          </div>
          <a
            href="/inventory"
            className="hidden sm:block text-xs text-brand-600 underline opacity-0 group-hover:opacity-100 transition-opacity"
          >
            Inventory Dekho →
          </a>
        </div>
        <div>
          <div className="text-3xl font-bold text-text-primary tabular-nums">
            {data.lowStock}
          </div>
          {(data.outOfStock ?? 0) > 0 && (
            <div className="text-xs text-error-700 mt-1">
              out of stock: {data.outOfStock}
            </div>
          )}
        </div>
      </div>

      {/* 4. Seller Score */}
      <div className="h-24 sm:h-[120px] p-5 bg-surface-card border border-border-default rounded-lg shadow-1 flex flex-col justify-between relative overflow-hidden">
        <div className="flex items-center gap-2 relative z-10">
          <Star className="text-accent-600" size={16} />
          <span className="text-xs font-medium text-text-secondary uppercase tracking-wider">
            Seller Score
          </span>
        </div>

        <div className="flex justify-between items-end relative z-10">
          <div>
            <div className="text-sm font-semibold text-text-primary mt-2">
              Score: {scoreData ? scoreData.score : "-"}/100
            </div>
            <div
              className={`text-xs font-medium mt-1 ${scoreData?.trend === "UP" ? "text-success-700" : scoreData?.trend === "DOWN" ? "text-error-700" : "text-text-muted"}`}
            >
              3 points{" "}
              {scoreData?.trend === "UP"
                ? "↑"
                : scoreData?.trend === "DOWN"
                  ? "↓"
                  : "→"}{" "}
              pichhle hafte
            </div>
          </div>

          {/* Card 04 Gauge — SVG semi-circle, 80px wide */}
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
                className={scoreColor}
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={strokeDasharray}
                strokeDashoffset={strokeDashoffset}
              />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}
