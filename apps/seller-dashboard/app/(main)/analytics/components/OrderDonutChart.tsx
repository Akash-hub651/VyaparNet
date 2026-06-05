"use client";

import React from "react";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts";
import { OrderDistributionViewModel } from "../../../../lib/api/analytics.client";

interface OrderDonutChartProps {
  data: OrderDistributionViewModel[] | null;
  totalOrders: number;
  isLoading: boolean;
  error: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  PLACED: "#3B82F6", // info-500
  CONFIRMED: "#2563EB", // brand-500
  PROCESSING: "#F59E0B", // warning-500
  SHIPPED: "#7C3AED", // accent-600
  DELIVERED: "#10B981", // success-500
  CANCELLED: "#D4D4D8", // neutral-300
};

export default function OrderDonutChart({
  data,
  totalOrders,
  isLoading,
  error,
}: OrderDonutChartProps) {
  // Loading State
  if (isLoading) {
    return (
      <div className="w-full h-[200px] md:h-[240px] bg-neutral-100 animate-pulse rounded-lg flex items-center justify-center border border-border-default">
        <span className="sr-only">Loading donut chart...</span>
      </div>
    );
  }

  // Error / Sprint 8 Gateway Placeholder State
  if (error || !data || data.length === 0) {
    return (
      <div className="w-full h-[200px] md:h-[240px] bg-surface-card border border-neutral-200 rounded-lg flex flex-col items-center justify-center p-6 text-center">
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
        <p className="text-sm font-bold text-text-primary">
          Order Distribution
        </p>
        <p className="text-xs text-text-secondary mt-1">
          Ye feature jald aayega
        </p>
        <p className="text-[10px] text-text-muted mt-0.5">
          Sprint 9 mein available hoga
        </p>
      </div>
    );
  }

  // Real Donut Chart
  return (
    <div
      className="w-full h-[200px] md:h-[240px] flex flex-row items-center relative"
      role="img"
      aria-label="Order status distribution"
    >
      <div className="flex-1 h-full relative">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="count"
              nameKey="status"
              innerRadius={60}
              outerRadius={90}
              paddingAngle={2}
              startAngle={90}
              endAngle={-270}
              stroke="none"
            >
              {data.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={STATUS_COLORS[entry.status] || "#94A3B8"}
                />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip totalOrders={totalOrders} />} />
          </PieChart>
        </ResponsiveContainer>

        {/* Center Label */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-2xl font-bold text-text-primary leading-none">
            {totalOrders}
          </span>
          <span className="text-xs text-text-secondary mt-1">Orders</span>
        </div>
      </div>

      {/* Legend */}
      <div className="w-32 shrink-0 flex flex-col justify-center gap-2 pl-4 border-l border-border-default ml-2">
        {data.slice(0, 6).map((entry) => {
          const percent =
            totalOrders > 0 ? Math.round((entry.count / totalOrders) * 100) : 0;
          return (
            <div key={entry.status} className="flex items-center gap-2">
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{
                  backgroundColor: STATUS_COLORS[entry.status] || "#94A3B8",
                }}
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-text-secondary truncate capitalize">
                  {entry.status.toLowerCase()}
                </p>
                <p className="text-[10px] text-text-muted mt-0.5">
                  {entry.count} · {percent}%
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CustomTooltip({
  active,
  payload,
  totalOrders,
}: {
  active?: boolean;
  payload?: Record<string, unknown>[];
  totalOrders: number;
}) {
  if (active && payload && payload.length) {
    const data = payload[0].payload as OrderDistributionViewModel;
    const percent =
      totalOrders > 0 ? Math.round((data.count / totalOrders) * 100) : 0;
    return (
      <div className="bg-surface-card border border-border-default rounded-lg shadow-2 p-2.5 z-20">
        <p className="text-sm font-medium text-text-primary">
          <span className="capitalize">{data.status.toLowerCase()}</span>:{" "}
          {data.count} orders ({percent}%)
        </p>
      </div>
    );
  }
  return null;
}
