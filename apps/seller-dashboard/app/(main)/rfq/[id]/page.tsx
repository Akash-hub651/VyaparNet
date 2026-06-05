"use client";

import React, { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useAuth } from "../../../contexts/auth.context";
import { useSellerPermissions } from "../../../../lib/hooks/useSellerPermissions";
import {
  getSellerRfqDetail,
  RfqViewModel,
  adaptRfqToViewModel,
} from "../../../../lib/api/rfq.client";
import { StatusBadge } from "../../../../components/ui/StatusBadge";
import { SkeletonCard } from "../../../../components/ui/Skeleton";
import { ErrorBanner } from "../../../../components/ui/ErrorBanner";
import { formatRelativeTime } from "../../../../lib/formatters";
import { QuotationForm } from "./components/QuotationForm";
import { NegotiationThread } from "./components/NegotiationThread";
import Link from "next/link";

export default function RfqDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;
  const { accessToken } = useAuth();
  const permissions = useSellerPermissions();

  const [rfq, setRfq] = useState<RfqViewModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showCounterForm, setShowCounterForm] = useState(false);

  const [now, setNow] = useState(() => Date.now());

  // Fetch RFQ Detail
  useEffect(() => {
    if (!accessToken || !id) return;

    let isMounted = true;

    async function loadRfq() {
      setLoading(true);
      setError(null);
      const res = await getSellerRfqDetail(id, accessToken!);

      if (isMounted) {
        if (res.error) {
          setError(res.error.message);
        } else if (res.data) {
          setRfq(adaptRfqToViewModel(res.data.data));
        }
        setLoading(false);
      }
    }

    loadRfq();

    return () => {
      isMounted = false;
    };
  }, [id, accessToken]);

  // Expiry Timer Interval
  useEffect(() => {
    if (!rfq) return;
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 60000); // update every 60s
    return () => clearInterval(interval);
  }, [rfq]);

  // Derived Timer States
  const expiryTime = rfq ? new Date(rfq.expiresAt).getTime() : 0;
  const remainingSecs = Math.max(0, Math.floor((expiryTime - now) / 1000));
  const isExpired = remainingSecs === 0;
  const remainingHours = Math.floor(remainingSecs / 3600);
  const remainingMins = Math.floor((remainingSecs % 3600) / 60);

  // Total duration (arbitrary baseline for progress bar if not provided - assuming 7 days)
  const totalDurationSecs = 7 * 24 * 3600;
  const progressPercent = Math.max(
    0,
    Math.min(100, (remainingSecs / totalDurationSecs) * 100),
  );

  const timerColor = isExpired
    ? "error"
    : remainingHours < 6
      ? "error"
      : remainingHours < 24
        ? "warning"
        : "brand";
  const timerBg = `bg-${timerColor}-50`;
  const timerText = `text-${timerColor}-700`;
  const timerFill = `bg-${timerColor}-500`;

  // Render Helpers
  const handleQuoteSuccess = (outcome?: "WON" | "LOST" | "QUOTED") => {
    setShowCounterForm(false);
    if (outcome && rfq) {
      setRfq({ ...rfq, status: outcome === "QUOTED" ? "QUOTED" : outcome });
    } else {
      window.location.reload(); // Fallback for new quote submission
    }
  };

  if (loading) {
    return (
      <div className="p-6 max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 space-y-6">
          <SkeletonCard className="h-40" />
          <SkeletonCard className="h-64" />
        </div>
        <div className="lg:col-span-4">
          <SkeletonCard className="h-96" />
        </div>
      </div>
    );
  }

  if (error || !rfq) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <ErrorBanner
          message={error || "RFQ not found"}
          onDismiss={() => router.push("/rfq")}
        />
        <button
          onClick={() => router.push("/rfq")}
          className="mt-4 text-brand-600 font-medium text-sm"
        >
          ← Wapas RFQ List par jayein
        </button>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Breadcrumb */}
      <nav className="mb-6 text-sm text-text-secondary flex items-center space-x-2">
        <Link href="/rfq" className="hover:text-brand-600 transition-colors">
          RFQ
        </Link>
        <span>/</span>
        <span className="text-text-primary font-medium">{rfq.rfqId}</span>
      </nav>

      {/* KYC Block Banner */}
      {!permissions.canSubmitRfqQuote && !permissions.isSuspended && (
        <div className="mb-6 p-4 bg-warning-50 border-l-4 border-warning-500 text-warning-800 rounded-r-md">
          <div className="flex items-center">
            <span className="mr-2">⚠️</span>
            <p className="text-sm">
              KYC complete karein to quote bhejne ke liye. Abhi aap sirf view
              kar sakte hain.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN */}
        <div className="lg:col-span-8 space-y-6">
          {/* L1: RFQ Header Card */}
          <div className="bg-surface-card rounded-xl shadow-1 p-6 border border-neutral-200">
            <div className="flex items-start justify-between mb-4">
              <h1 className="text-2xl font-bold text-text-primary">
                {rfq.rfqId}
              </h1>
              <StatusBadge status={rfq.status} />
            </div>

            <p className="text-text-primary mb-2">
              <span className="font-medium text-text-secondary">Segment:</span>{" "}
              {rfq.segment} ·
              <span className="font-medium text-text-secondary ml-2">
                Quantity:
              </span>{" "}
              {rfq.quantity.toLocaleString("en-IN")} {rfq.unit} ·
              <span className="font-medium text-text-secondary ml-2">
                Budget:
              </span>{" "}
              ₹{rfq.budgetMin?.toLocaleString("en-IN") || "0"}–₹
              {rfq.budgetMax?.toLocaleString("en-IN") || "Open"}/{rfq.unit}
            </p>

            <p className="text-sm text-text-secondary">
              Posted: {formatRelativeTime(rfq.createdAt)}
            </p>
          </div>

          {/* L2: Buyer Requirements */}
          <div className="bg-surface-card rounded-xl shadow-1 p-6 border border-neutral-200">
            <h2 className="text-lg font-semibold text-text-primary mb-4 border-b border-neutral-100 pb-2">
              Kya chahiye buyer ko?
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-4 gap-x-8">
              <div className="flex flex-col">
                <span className="text-xs text-text-secondary uppercase tracking-wider">
                  Product Need
                </span>
                <span className="text-sm text-text-primary font-medium mt-1">
                  {rfq.productRequired}
                </span>
              </div>

              <div className="flex flex-col">
                <span className="text-xs text-text-secondary uppercase tracking-wider">
                  Description
                </span>
                <span className="text-sm text-text-primary mt-1">
                  {rfq.description || "No description provided."}
                </span>
              </div>

              {Object.entries(rfq.requirements || {}).map(([key, value]) => (
                <div key={key} className="flex flex-col">
                  <span className="text-xs text-text-secondary uppercase tracking-wider">
                    {key.replace(/([A-Z])/g, " $1").trim()}
                  </span>
                  <span className="text-sm text-text-primary mt-1">
                    {String(value)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* L3: Buyer Context (if available) */}
          {rfq.buyerContext?.type && (
            <div className="bg-neutral-50 rounded-lg p-4 border border-neutral-200 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-text-primary">
                  Buyer Context
                </h3>
                <p className="text-xs text-text-secondary mt-1">
                  Type: {rfq.buyerContext.type} · Location:{" "}
                  {rfq.buyerContext.location || "Unknown"}
                </p>
              </div>
              {rfq.buyerContext.rating && (
                <div className="bg-white px-3 py-1 rounded-full text-xs font-medium border border-neutral-200 shadow-sm flex items-center gap-1">
                  <span>⭐</span> {rfq.buyerContext.rating}/5
                </div>
              )}
            </div>
          )}

          {/* L4: Negotiation Thread (if quoted) */}
          {rfq.status === "QUOTED" && !showCounterForm && (
            <div className="bg-surface-card rounded-xl shadow-1 p-6 border border-neutral-200">
              <NegotiationThread
                rfq={rfq}
                token={accessToken!}
                onActionSuccess={handleQuoteSuccess}
                onOpenCounterForm={() => setShowCounterForm(true)}
              />
            </div>
          )}
        </div>

        {/* RIGHT COLUMN (Sticky) */}
        <div className="lg:col-span-4 sticky top-24 space-y-6">
          {/* R1: Expiry Timer */}
          <div
            className={`rounded-xl shadow-1 p-6 border ${isExpired ? "border-error-200 bg-error-50" : `border-neutral-200 ${timerBg}`}`}
          >
            <h3 className="text-sm font-medium text-text-secondary mb-2">
              Expires In:
            </h3>

            {isExpired ? (
              <div
                className="text-error-700 font-bold text-lg"
                role="alert"
                aria-live="assertive"
                aria-label="Ye RFQ expire ho gaya hai"
              >
                Ye RFQ expire ho gaya hai
              </div>
            ) : (
              <div className="space-y-4">
                <div
                  className={`text-3xl font-bold tabular-nums ${timerText}`}
                  role="timer"
                  aria-live="polite"
                  aria-label={`RFQ expire time bacha hai: ${remainingHours} ghante ${remainingMins} minute`}
                >
                  {remainingHours}h {remainingMins}m
                </div>

                <div
                  className="w-full bg-neutral-200 rounded-full h-2"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={totalDurationSecs}
                  aria-valuenow={remainingSecs}
                  aria-label="RFQ expiry progress bar"
                >
                  <div
                    className={`h-2 rounded-full ${timerFill} transition-all duration-1000 ease-linear`}
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* R2: Quote Form */}
          {!isExpired &&
          permissions.canSubmitRfqQuote &&
          !permissions.isSuspended &&
          (rfq.status === "NOT_QUOTED" || showCounterForm) ? (
            <QuotationForm
              rfq={rfq}
              token={accessToken!}
              onSuccess={handleQuoteSuccess}
            />
          ) : null}

          {/* Fallback messages if form hidden */}
          {!permissions.canSubmitRfqQuote &&
            rfq.status === "NOT_QUOTED" &&
            !isExpired && (
              <div className="bg-surface-card rounded-xl shadow-1 p-6 border border-neutral-200 text-center">
                <p className="text-sm text-text-secondary">
                  Quote submit karne ke liye KYC complete karein.
                </p>
                <Link
                  href="/settings#kyc"
                  className="mt-3 inline-block px-4 py-2 bg-brand-50 text-brand-700 rounded text-sm font-medium hover:bg-brand-100 transition-colors"
                >
                  Complete KYC →
                </Link>
              </div>
            )}

          {isExpired && rfq.status === "NOT_QUOTED" && (
            <div className="bg-surface-card rounded-xl shadow-1 p-6 border border-neutral-200 text-center">
              <p className="text-sm text-text-secondary">
                Agle RFQ ka intezaar karein
              </p>
              <Link
                href="/rfq"
                className="mt-3 inline-block px-4 py-2 bg-neutral-100 text-neutral-700 rounded text-sm font-medium hover:bg-neutral-200 transition-colors"
              >
                ← Wapas List Pe
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
