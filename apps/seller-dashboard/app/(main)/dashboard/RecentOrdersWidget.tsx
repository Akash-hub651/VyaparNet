"use client";

import React from "react";
import Link from "next/link";
import { formatAmount, formatRelativeTime } from "../../../lib/formatters";
import type { RecentOrderPreviewDto } from "../../../lib/api/dashboard.client";
import { StatusBadge } from "../../../components/ui/StatusBadge";
import { Skeleton } from "../../../components/ui/Skeleton";
import { ErrorBanner } from "../../../components/ui/ErrorBanner";

interface RecentOrdersWidgetProps {
  orders?: RecentOrderPreviewDto[];
  isLoading: boolean;
  error?: Error;
  onRetry?: () => void;
}

export function RecentOrdersWidget({
  orders,
  isLoading,
  error,
  onRetry,
}: RecentOrdersWidgetProps): React.JSX.Element {
  if (error) {
    return (
      <div className="bg-surface-card border border-border-default rounded-lg p-5">
        <h3 className="text-base font-semibold mb-4 text-text-primary">
          Recent Orders
        </h3>
        <ErrorBanner message="Orders load nahi ho paye." onRetry={onRetry} />
      </div>
    );
  }

  return (
    <div className="bg-surface-card border border-border-default rounded-lg p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold text-text-primary">
          Recent Orders
        </h3>
        <Link
          href="/orders"
          className="text-sm font-medium text-brand-600 hover:underline"
        >
          Sab Orders Dekho →
        </Link>
      </div>

      {/* Desktop View */}
      <div className="hidden sm:flex flex-col">
        {isLoading ? (
          // Skeleton loading state
          Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center justify-between h-12 border-b border-border-default last:border-0"
            >
              <Skeleton className="w-16 h-4" />
              <Skeleton className="w-24 h-4" />
              <Skeleton className="w-16 h-4" />
              <Skeleton className="w-20 h-6 rounded-full" />
              <Skeleton className="w-16 h-3" />
            </div>
          ))
        ) : !orders || orders.length === 0 ? (
          // Empty state
          <div className="py-8 text-center text-sm text-text-secondary">
            Abhi koi order nahi. Jab orders aayenge, yahan dikhenge.
          </div>
        ) : (
          // Data state
          orders.map((order) => (
            <Link
              href={`/orders/${order.id}`}
              key={order.id}
              className={`flex items-center justify-between h-12 border-b border-border-default last:border-0 hover:bg-surface-hover transition-colors px-2 -mx-2 rounded-md ${order.status === "PLACED" ? "bg-info-50" : ""}`}
            >
              <div className="w-24 font-medium text-sm text-brand-600 truncate">
                #{order.orderNumber}
              </div>
              <div className="flex-1 text-sm text-text-primary truncate px-2">
                {order.buyerName}
              </div>
              <div className="w-24 text-sm text-text-primary tabular-nums text-right px-2">
                {formatAmount(order.totalAmount)}
              </div>
              <div className="w-28 px-2 flex justify-end">
                <StatusBadge status={order.status} size="sm" />
              </div>
              <div className="w-24 text-xs text-text-secondary text-right truncate">
                {formatRelativeTime(order.createdAt)}
              </div>
            </Link>
          ))
        )}
      </div>

      {/* Mobile Card View (Max 3 items) */}
      <div className="flex sm:hidden flex-col gap-3">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div
              key={`mob-${i}`}
              className="h-16 p-3 border border-border-default rounded-lg flex flex-col justify-between"
            >
              <div className="flex justify-between items-center">
                <Skeleton className="w-24 h-4" />
                <Skeleton className="w-16 h-4" />
              </div>
              <div className="flex justify-between items-center">
                <Skeleton className="w-32 h-3" />
                <Skeleton className="w-16 h-5 rounded-full" />
              </div>
            </div>
          ))
        ) : !orders || orders.length === 0 ? (
          <div className="py-6 text-center text-sm text-text-secondary">
            Abhi koi order nahi.
          </div>
        ) : (
          orders.slice(0, 3).map((order) => (
            <Link
              href={`/orders/${order.id}`}
              key={`mob-${order.id}`}
              className={`p-3 border border-border-default rounded-lg flex flex-col justify-between h-16 transition-colors active:bg-surface-hover ${order.status === "PLACED" ? "bg-info-50 border-info-200" : ""}`}
            >
              <div className="flex justify-between items-center mb-1">
                <span className="font-medium text-sm text-brand-600 truncate">
                  #{order.orderNumber} • {order.buyerName}
                </span>
                <span className="text-sm font-semibold text-text-primary tabular-nums shrink-0">
                  {formatAmount(order.totalAmount)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-text-secondary">
                  {formatRelativeTime(order.createdAt)}
                </span>
                <StatusBadge status={order.status} size="sm" />
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
