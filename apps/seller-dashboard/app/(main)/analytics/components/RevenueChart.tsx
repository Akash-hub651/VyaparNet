"use client";

import React from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Area,
} from "recharts";
import { RevenueTrendViewModel } from "../../../../lib/api/analytics.client";
import { formatAmount } from "../../../../lib/formatters";

interface RevenueChartProps {
  data: RevenueTrendViewModel[] | null;
  isLoading: boolean;
  error: string | null;
}

export default function RevenueChart({
  data,
  isLoading,
  error,
}: RevenueChartProps) {
  // Loading State
  if (isLoading) {
    return (
      <div className="w-full h-[180px] md:h-[240px] bg-neutral-100 animate-pulse rounded-lg flex items-center justify-center border border-border-default">
        <span className="sr-only">Loading chart...</span>
      </div>
    );
  }

  // Error / Sprint 8 Gateway Placeholder State
  if (error) {
    return (
      <div className="w-full h-[180px] md:h-[240px] bg-surface-card border border-neutral-200 rounded-lg flex flex-col items-center justify-center p-6 text-center">
        <div className="w-12 h-12 rounded-full bg-neutral-100 flex items-center justify-center mb-3">
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="text-neutral-400"
          >
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
        </div>
        <p className="text-sm font-bold text-text-primary">Revenue Trend</p>
        <p className="text-xs text-text-secondary mt-1">
          Ye feature jald aayega
        </p>
        <p className="text-[10px] text-text-muted mt-0.5">
          Sprint 9 mein available hoga
        </p>
      </div>
    );
  }

  // Exact Empty State
  if (data && data.length === 0) {
    return (
      <div className="w-full h-[180px] md:h-[240px] flex flex-col items-center justify-center p-6 text-center border border-border-default rounded-lg bg-surface-card">
        <svg
          width="32"
          height="32"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-neutral-400 mb-2"
        >
          <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
          <polyline points="17 6 23 6 23 12" />
        </svg>
        <p className="text-sm font-medium text-text-primary">
          Abhi tak koi order nahi hua
        </p>
        <p className="text-xs text-text-secondary mt-1 max-w-[200px]">
          Orders aane ke baad trend dikhega.
        </p>
      </div>
    );
  }

  // Real Chart
  const formatYAxis = (val: number) => {
    if (val < 1000) return `₹${val}`;
    if (val < 100000) return `₹${val / 1000}K`;
    if (val < 10000000) return `₹${val / 100000}L`;
    return `₹${val / 10000000}Cr`;
  };

  let ariaLabel = "Revenue trend chart";
  if (data && data.length > 0) {
    const start = data[0].revenue;
    const end = data[data.length - 1].revenue;
    const delta = start > 0 ? Math.round(((end - start) / start) * 100) : 0;
    const direction = delta >= 0 ? "up" : "down";
    ariaLabel = `Revenue trend: started at ₹${start}, ended at ₹${end}, ${direction} ${Math.abs(delta)}%`;
  }

  return (
    <div
      className="w-full h-[180px] md:h-[240px]"
      role="img"
      aria-label={ariaLabel}
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data || undefined}
          margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
        >
          <defs>
            <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2563EB" stopOpacity={0.15} />
              <stop offset="100%" stopColor="#2563EB" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="4 4"
            vertical={false}
            stroke="#E2E8F0"
          />
          <XAxis
            dataKey="date"
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 12, fill: "#64748B" }}
            tickFormatter={(val) => {
              const d = new Date(val);
              return isNaN(d.getTime())
                ? val
                : `${d.getDate()} ${d.toLocaleString("default", { month: "short" })}`;
            }}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 12, fill: "#64748B" }}
            tickFormatter={formatYAxis}
            width={60}
          />
          <Tooltip
            content={<CustomTooltip />}
            cursor={{
              stroke: "#94A3B8",
              strokeWidth: 1,
              strokeDasharray: "4 4",
            }}
          />
          <Area
            type="monotone"
            dataKey="revenue"
            stroke="none"
            fillOpacity={1}
            fill="url(#colorRevenue)"
          />
          <Line
            type="monotone"
            dataKey="revenue"
            stroke="#2563EB"
            strokeWidth={2}
            dot={false}
            activeDot={{
              r: 4,
              fill: "#2563EB",
              stroke: "#fff",
              strokeWidth: 2,
            }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Record<string, unknown>[];
}) {
  if (active && payload && payload.length) {
    const data = payload[0].payload as RevenueTrendViewModel;
    const d = new Date(data.date);
    const dateStr = isNaN(d.getTime())
      ? data.date
      : `${d.getDate()} ${d.toLocaleString("default", { month: "short" })} ${d.getFullYear()}`;
    return (
      <div className="bg-surface-card border border-border-default rounded-lg shadow-2 p-3 z-20 min-w-[140px]">
        <p className="text-xs text-text-secondary">{dateStr}</p>
        <p className="text-sm font-bold text-text-primary mt-1">
          {formatAmount(data.revenue)}
        </p>
        <p className="text-xs text-text-secondary mt-0.5">
          {data.orders} orders
        </p>
      </div>
    );
  }
  return null;
}
