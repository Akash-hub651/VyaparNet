"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { OrderPreviewDto } from "../../../../lib/api/orders.client";
import { formatAmount, formatRelativeTime } from "../../../../lib/formatters";
import { StatusBadge } from "../../../../components/ui/StatusBadge";
import { Button } from "../../../../components/ui/Button";
import { Skeleton } from "../../../../components/ui/Skeleton";
import { useSellerPermissions } from "../../../../lib/hooks/useSellerPermissions";

interface OrdersMobileListProps {
  orders: OrderPreviewDto[];
  isLoading: boolean;
  onActionClick: (
    orderId: string,
    action:
      | "CONFIRM"
      | "SHIP"
      | "DELIVER"
      | "COMPLETE"
      | "DOWNLOAD_INVOICE"
      | "CANCEL",
  ) => void;
  actionLoadingId: string | null;
}

export function OrdersMobileList({
  orders,
  isLoading,
  onActionClick,
  actionLoadingId,
}: OrdersMobileListProps) {
  const perms = useSellerPermissions();
  const router = useRouter();
  const [nowMs] = React.useState(() => Date.now()); // captured once per render for aging calculations

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="bg-surface-card border border-border-default rounded-lg p-3 h-24"
          >
            <Skeleton className="w-full h-4 mb-2" />
            <Skeleton className="w-2/3 h-4 mb-2" />
            <Skeleton className="w-1/2 h-4" />
          </div>
        ))}
      </div>
    );
  }

  if (orders.length === 0) {
    return null; // Empty state is handled by the parent
  }

  return (
    <div className="flex flex-col gap-3 pb-24">
      {orders.map((order) => {
        const hoursOld =
          (nowMs - new Date(order.createdAt).getTime()) / (1000 * 60 * 60);
        const isAging = order.status === "PLACED" && hoursOld > 4;

        // Action buttons logic
        let actions = null;
        if (order.status === "PLACED") {
          actions = (
            <div className="flex gap-2 w-full mt-3 pt-3 border-t border-border-default">
              <div className="flex-1">
                <Button
                  variant="primary"
                  fullWidth
                  size="sm"
                  className="min-h-[44px]"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onActionClick(order.id, "CONFIRM");
                  }}
                  isLoading={actionLoadingId === order.id}
                  disabled={
                    actionLoadingId !== null ||
                    perms.isSuspended ||
                    perms.businessMissing
                  }
                >
                  Confirm
                </Button>
              </div>
              {/* Cancel is blocked for Sellers per architecture rules */}
            </div>
          );
        } else if (
          order.status === "CONFIRMED" ||
          order.status === "PROCESSING"
        ) {
          actions = (
            <div className="flex gap-2 w-full mt-3 pt-3 border-t border-border-default">
              <div className="flex-1">
                <Button
                  variant="primary"
                  fullWidth
                  size="sm"
                  className="min-h-[44px]"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onActionClick(order.id, "SHIP");
                  }}
                  isLoading={actionLoadingId === order.id}
                  disabled={
                    actionLoadingId !== null ||
                    perms.isSuspended ||
                    perms.businessMissing
                  }
                >
                  Ship
                </Button>
              </div>
              <div className="flex-1">
                <Button
                  variant="ghost"
                  fullWidth
                  size="sm"
                  className="min-h-[44px]"
                  onClick={(e) => {
                    e.preventDefault();
                  }} // Link will handle navigation
                >
                  Details
                </Button>
              </div>
            </div>
          );
        } else if (order.status === "SHIPPED" || order.status === "DELIVERED") {
          actions = (
            <div className="flex gap-2 w-full mt-3 pt-3 border-t border-border-default">
              <div className="flex-1">
                <Button
                  variant="ghost"
                  fullWidth
                  size="sm"
                  className="min-h-[44px]"
                  onClick={(e) => {
                    e.preventDefault();
                  }} // Link will handle navigation
                >
                  Details
                </Button>
              </div>
            </div>
          );
        }

        return (
          <div
            key={order.id}
            onClick={() => router.push(`/orders/${order.id}`)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                router.push(`/orders/${order.id}`);
              }
            }}
            className={`block bg-surface-card rounded-lg border p-3 active:bg-surface-hover transition-colors cursor-pointer
              ${isAging ? "bg-error-50 border-error-200 border-l-2" : "border-border-default border-l-2 border-l-brand-600"}
            `}
          >
            <div className="flex justify-between items-start mb-1">
              <span className="font-medium text-sm text-brand-600 truncate mr-2">
                #{order.orderNumber}
              </span>
              <div className="flex flex-col items-end gap-1">
                <StatusBadge status={order.status} size="sm" />
                <span className="text-xs text-text-secondary">
                  {formatRelativeTime(order.createdAt)}
                </span>
              </div>
            </div>

            <div className="mb-1 text-sm font-medium text-text-primary truncate pr-16">
              {order.buyerName}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold tabular-nums">
                {formatAmount(order.amount)}
              </span>
              <span className="text-xs text-text-secondary">
                • {order.itemCount} items
              </span>
            </div>

            {actions}
          </div>
        );
      })}
    </div>
  );
}
