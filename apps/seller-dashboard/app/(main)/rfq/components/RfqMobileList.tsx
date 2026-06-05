"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RfqViewModel } from "../../../../lib/api/rfq.client";

interface RfqMobileListProps {
  items: RfqViewModel[];
  isLoading?: boolean;
  canQuote: boolean;
}

function getExpiryDisplay(expiresAtStr: string) {
  const expiresAt = new Date(expiresAtStr).getTime();
  const now = new Date().getTime();
  const diffMs = expiresAt - now;

  if (diffMs <= 0) {
    return {
      text: "Expire ho gaya",
      colorClass: "bg-neutral-100 text-neutral-600 border-neutral-200",
      isUrgent: false,
    };
  }

  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

  if (diffHours > 24) {
    const days = Math.floor(diffHours / 24);
    return {
      text: `${days} din bache hain`,
      colorClass: "bg-surface-base text-text-secondary border-neutral-200",
      isUrgent: false,
    };
  }

  if (diffHours >= 6) {
    return {
      text: `${diffHours}h left`,
      colorClass: "bg-warning-50 text-warning-700 border-warning-200",
      isUrgent: false,
    };
  }

  return {
    text: `${diffHours}h ${diffMins}m left`,
    colorClass: "bg-error-50 text-error-700 border-error-200 font-medium",
    isUrgent: true,
  };
}

export function RfqMobileList({
  items,
  isLoading,
  canQuote,
}: RfqMobileListProps) {
  const router = useRouter();
  const [, setTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 60000);
    return () => clearInterval(interval);
  }, []);

  if (isLoading) {
    return (
      <div className="space-y-4 md:hidden">
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            className="bg-surface-card rounded-xl p-4 border border-neutral-200 shadow-sm animate-pulse min-h-[96px]"
          >
            <div className="flex justify-between mb-2">
              <div className="h-5 w-24 bg-neutral-200 rounded"></div>
              <div className="h-5 w-20 bg-neutral-200 rounded-full"></div>
            </div>
            <div className="h-4 w-3/4 bg-neutral-200 rounded mb-4"></div>
            <div className="h-11 w-full bg-neutral-200 rounded-md"></div>
          </div>
        ))}
      </div>
    );
  }

  if (items.length === 0) return null;

  return (
    <div className="space-y-4 md:hidden">
      {items.map((item) => {
        const expiry = getExpiryDisplay(item.expiresAt);

        let badgeClasses = "bg-neutral-100 text-neutral-700";
        let badgeLabel: string = item.status;
        if (item.status === "NOT_QUOTED") {
          badgeClasses = "bg-warning-100 text-warning-700";
          badgeLabel = "Quote Karo";
        } else if (item.status === "QUOTED") {
          badgeClasses = "bg-info-100 text-info-700";
          badgeLabel = "Quoted";
        } else if (item.status === "EXPIRED") {
          badgeClasses = "bg-neutral-100 text-neutral-700";
          badgeLabel = "Expire";
        } else if (item.status === "WON") {
          badgeClasses = "bg-success-100 text-success-700";
          badgeLabel = "Won 🎉";
        } else if (item.status === "LOST") {
          badgeClasses = "bg-neutral-100 text-neutral-700";
          badgeLabel = "Lost";
        }

        return (
          <div
            key={item.id}
            role="button"
            tabIndex={0}
            className="bg-surface-card border border-neutral-200 rounded-xl shadow-sm p-4 flex flex-col justify-between min-h-[96px] active:bg-neutral-50"
            onClick={() => router.push(`/rfq/${item.id}`)}
            onKeyDown={(e) => {
              if (e.key === "Enter") router.push(`/rfq/${item.id}`);
            }}
          >
            {/* Row 1: ID + Expiry Chip / Status */}
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-bold text-brand-600">
                {item.rfqId}
              </span>
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${badgeClasses}`}
                >
                  {badgeLabel}
                </span>
                <div
                  className={`inline-flex items-center gap-1 px-2 py-0.5 border rounded-full text-[10px] whitespace-nowrap ${expiry.colorClass}`}
                >
                  {expiry.isUrgent && (
                    <span className="w-1.5 h-1.5 rounded-full bg-error-500 animate-pulse"></span>
                  )}
                  {expiry.text}
                </div>
              </div>
            </div>

            {/* Row 2: Details */}
            <div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-text-primary">
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-brand-50 text-brand-700 border border-brand-100 uppercase tracking-wide">
                {item.segment.replace(/_/g, " ")}
              </span>
              <span className="font-medium">{item.productRequired}</span>
              <span className="text-text-secondary hidden sm:inline">•</span>
              <span>
                {item.quantity.toLocaleString("en-IN")}{" "}
                <span className="text-xs">{item.unit}</span>
              </span>
              <span className="text-text-secondary">•</span>
              <span className="font-mono text-text-secondary">
                {item.budgetMin && item.budgetMax
                  ? `₹${item.budgetMin.toLocaleString("en-IN")}–₹${item.budgetMax.toLocaleString("en-IN")}`
                  : item.budgetMax
                    ? `Up to ₹${item.budgetMax.toLocaleString("en-IN")}`
                    : item.budgetMin
                      ? `Min ₹${item.budgetMin.toLocaleString("en-IN")}`
                      : "Open"}
              </span>
            </div>

            {/* Row 3: CTA */}
            {item.status === "NOT_QUOTED" ? (
              <button
                disabled={!canQuote}
                className={`w-full flex items-center justify-center h-[44px] rounded-lg text-sm font-semibold transition-colors ${canQuote ? "bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800" : "bg-neutral-100 text-neutral-400 opacity-70"}`}
                onClick={(e) => {
                  e.stopPropagation();
                  if (canQuote) router.push(`/rfq/${item.id}`);
                }}
              >
                Quote Karein
              </button>
            ) : (
              <button
                className="w-full flex items-center justify-center h-[44px] rounded-lg text-sm font-semibold bg-brand-50 text-brand-700 border border-brand-200 active:bg-brand-100"
                onClick={(e) => {
                  e.stopPropagation();
                  router.push(`/rfq/${item.id}`);
                }}
              >
                Quote Dekho
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
