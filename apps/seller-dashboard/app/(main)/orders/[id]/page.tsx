"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useHeader } from "../../../contexts/header.context";
import { useAuth } from "../../../../app/contexts/auth.context";
import { useToast } from "../../../../components/ui/Toast";
import { ErrorBanner } from "../../../../components/ui/ErrorBanner";
import { Skeleton } from "../../../../components/ui/Skeleton";
import { StatusBadge } from "../../../../components/ui/StatusBadge";
import { Copy } from "lucide-react";
import {
  OrderDetailDto,
  getOrderById,
  updateOrderStatus,
  OrderStatus,
} from "../../../../lib/api/orders.client";
import { OrderTimeline } from "./OrderTimeline";
import { OrderItemsTable } from "./OrderItemsTable";
import { DispatchDetails } from "./DispatchDetails";
import { ActionPanel } from "./ActionPanel";
import { BuyerInfoCard } from "./BuyerInfoCard";
import { FinancialSummaryCard } from "./FinancialSummaryCard";
import { ShippingModal } from "./ShippingModal";
import { useSellerPermissions } from "../../../../lib/hooks/useSellerPermissions";

export default function OrderDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();
  const header = useHeader();
  const { addToast } = useToast();
  const { accessToken } = useAuth();
  const perms = useSellerPermissions();

  const [order, setOrder] = useState<OrderDetailDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const [isShippingModalOpen, setIsShippingModalOpen] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);

  // Calculate age warning — captured once per render
  const [nowMs] = React.useState(() => Date.now());

  const fetchOrder = useCallback(async () => {
    if (!accessToken) return;
    try {
      setError(null);
      const res = await getOrderById(id, accessToken);
      if (!res.success) {
        throw new Error(res.error || "Order fetch failed");
      }
      if (!res.data) {
        throw new Error("Order not found");
      }
      setOrder(res.data);
      header.setTitle(`Order ${res.data.orderNumber}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err : new Error(String(err)));
      header.setTitle("Order Detail");
    } finally {
      setIsLoading(false);
    }
  }, [id, accessToken, header]);

  useEffect(() => {
    void Promise.resolve().then(() => fetchOrder());
  }, [fetchOrder]);

  const handleActionClick = async (
    action: "CONFIRM" | "SHIP" | "DELIVER" | "COMPLETE" | "DOWNLOAD_INVOICE",
  ) => {
    if (!order) return;

    if (action === "SHIP") {
      setIsShippingModalOpen(true);
      return;
    }

    if (action === "DOWNLOAD_INVOICE") {
      /**
       * INTEGRATION PENDING: HIGH-BL2
       * Invoice download requires: GET /seller/orders/{id}/invoice
       * → returns PDF binary (Content-Type: application/pdf) or presigned URL
       * This endpoint is NOT yet confirmed in Sprint 8 backend.
       * Until live: show informational unavailable toast.
       */
      addToast({
        variant: "info",
        message:
          "Invoice download jald aayega — is feature par kaam ho raha hai.",
      });
      return;
    }

    // Handle State Transitions
    let nextState: OrderStatus | null = null;
    if (action === "CONFIRM") nextState = "CONFIRMED";
    else if (action === "DELIVER") nextState = "DELIVERED";
    else if (action === "COMPLETE") nextState = "COMPLETED";

    if (nextState) {
      setIsActionLoading(true);
      try {
        const res = await updateOrderStatus(
          order.id,
          nextState,
          accessToken ?? "",
        );
        if (!res.success) throw new Error(res.error);

        addToast({
          variant: "success",
          message: `Order ${nextState.toLowerCase()} ho gaya`,
        });

        // Optimistic UI update
        setOrder((prev) => {
          if (!prev) return prev;
          const newTimeline = [
            ...prev.timeline,
            {
              status: nextState as OrderStatus,
              timestamp: new Date().toISOString(),
              actor: "You",
            },
          ];
          return {
            ...prev,
            status: nextState as OrderStatus,
            timeline: newTimeline,
          };
        });
      } catch (err: unknown) {
        addToast({
          variant: "error",
          message:
            err instanceof Error
              ? err.message
              : "Action fail ho gaya. Phir try karein.",
        });
      } finally {
        setIsActionLoading(false);
      }
    }
  };

  const handleCopyOrderNumber = () => {
    if (!order) return;
    // MEDIUM-S3 FIX: clipboard.writeText requires HTTPS (secure context).
    // Guard with try/catch; fall back to execCommand for HTTP deployments.
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard
        .writeText(order.orderNumber)
        .then(() => {
          addToast({
            variant: "success",
            message: "Order number copy ho gaya",
          });
        })
        .catch(() => {
          addToast({ variant: "error", message: "Copy nahi ho paya" });
        });
    } else {
      // Fallback for non-HTTPS environments
      try {
        const textarea = document.createElement("textarea");
        textarea.value = order.orderNumber;
        textarea.style.cssText = "position:fixed;top:-9999px;left:-9999px";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
        addToast({ variant: "success", message: "Order number copy ho gaya" });
      } catch {
        addToast({
          variant: "error",
          message: "Copy nahi ho paya — manually copy karein",
        });
      }
    }
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pb-20">
        <div className="lg:col-span-8 space-y-6">
          <Skeleton className="w-full h-32 rounded-lg" />
          <Skeleton className="w-full h-80 rounded-lg" />
          <Skeleton className="w-full h-64 rounded-lg" />
        </div>
        <div className="lg:col-span-4 space-y-6">
          <Skeleton className="w-full h-24 rounded-lg" />
          <Skeleton className="w-full h-48 rounded-lg" />
          <Skeleton className="w-full h-64 rounded-lg" />
        </div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="max-w-2xl mx-auto mt-8">
        <ErrorBanner
          message={
            error?.message ||
            "Order details load nahi ho paye. Shayad delete ho gai ya galat link hai."
          }
          onRetry={fetchOrder}
        />
        <button
          onClick={() => router.push("/orders")}
          className="mt-6 text-sm font-medium text-brand-600 hover:text-brand-800 focus-visible:outline-none"
        >
          ← Orders pe wapas jaiye
        </button>
      </div>
    );
  }

  const hoursOld =
    (nowMs - new Date(order.createdAt).getTime()) / (1000 * 60 * 60);
  const showAgeWarning = order.status === "PLACED" && hoursOld > 4;

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pb-24 lg:pb-6">
        {/* LEFT COLUMN */}
        <div className="lg:col-span-8 space-y-6">
          {/* L1: Order Header Card */}
          <div className="bg-surface-default border border-border-default rounded-lg p-5">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-3">
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold text-text-primary">
                  {order.orderNumber}
                </h1>
                <button
                  onClick={handleCopyOrderNumber}
                  className="w-11 h-11 flex items-center justify-center -ml-2 text-text-muted hover:text-brand-600 transition-colors focus-visible:outline-none rounded-md"
                  aria-label="Order number copy karein"
                >
                  <Copy size={16} />
                </button>
              </div>
              <StatusBadge status={order.status} />
            </div>

            <div className="flex flex-wrap items-center gap-2 text-sm text-text-secondary">
              <span>
                Placed:{" "}
                {new Date(order.createdAt).toLocaleString("en-IN", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </span>
              <span className="hidden sm:inline">•</span>
              <span>Buyer: {order.buyerContact.name}</span>
              <span className="hidden sm:inline">•</span>
              <span>
                {order.items.reduce((acc, i) => acc + i.qty, 0)} items
              </span>
            </div>

            {showAgeWarning && (
              <div className="mt-4 bg-warning-50 rounded p-3 flex items-start gap-3">
                <div className="text-warning-600 mt-0.5">
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="8" x2="12" y2="12"></line>
                    <line x1="12" y1="16" x2="12.01" y2="16"></line>
                  </svg>
                </div>
                <p className="text-sm font-medium text-warning-800">
                  Ye order {hoursOld.toFixed(1)} ghante se zyada purana hai —
                  action zaruri
                </p>
              </div>
            )}
          </div>

          {/* L2: Order Timeline */}
          <OrderTimeline
            timeline={order.timeline}
            currentStatus={order.status}
          />

          {/* L3: Order Items Table */}
          <OrderItemsTable items={order.items} payment={order.payment} />

          {/* L4: Dispatch Details (Conditional) */}
          {order.dispatch &&
            (order.status === "SHIPPED" ||
              order.status === "DELIVERED" ||
              order.status === "COMPLETED") && (
              <DispatchDetails
                dispatch={order.dispatch}
                onEditClick={() => setIsShippingModalOpen(true)}
                canEdit={order.status === "SHIPPED" && !perms.isStaff}
              />
            )}
        </div>

        {/* RIGHT COLUMN */}
        <div className="lg:col-span-4 space-y-6 relative">
          {/* Mobile Sticky Bottom Action Bar wrapper vs Desktop Sticky Sidebar */}
          <div className="fixed bottom-0 left-0 right-0 h-16 px-4 py-2 flex items-center justify-center bg-surface-card border-t border-border-default z-30 lg:static lg:h-auto lg:p-0 lg:block lg:bg-transparent lg:border-none lg:z-auto">
            <div className="w-full">
              <ActionPanel
                orderId={order.id}
                status={order.status}
                onActionClick={handleActionClick}
                isActionLoading={isActionLoading}
              />
            </div>
          </div>

          <BuyerInfoCard
            buyerContact={order.buyerContact}
            orderStatus={order.status}
          />

          <FinancialSummaryCard payment={order.payment} />
        </div>
      </div>

      <ShippingModal
        orderId={order.id}
        orderNumber={order.orderNumber}
        isOpen={isShippingModalOpen}
        onClose={() => setIsShippingModalOpen(false)}
        onSuccess={fetchOrder} // Re-fetch to get dispatch info from backend
      />
    </>
  );
}
