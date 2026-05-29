'use client';

/**
 * Order Confirmation Page — apps/web/app/(main)/checkout/confirmation/page.tsx
 *
 * Authority: SPRINT_4_EXECUTION_LOCK_FINAL.md §22 (PHASE 8 — FRONTEND)
 *
 * Requirements:
 * - Checkmark success animation (< 300ms, respects prefers-reduced-motion)
 * - Order number (VN-XXXXXXXX) displayed prominently
 * - Estimated delivery (placeholder: "2–5 business days")
 * - "Track Order" button (stub — Sprint 5)
 * - "Continue Shopping" button
 */

import React, { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

function ConfirmationPageInner(): React.JSX.Element {
  const searchParams = useSearchParams();
  const orderNumber = searchParams.get('orderNumber') ?? 'VN-00000000';

  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center max-w-xl mx-auto px-4 py-16 text-center">
      {/* ── Checkmark Success Animation ── */}
      <div className="mb-8" id="confirmation-checkmark">
        <svg
          className="w-24 h-24 text-emerald-500 animate-[scaleIn_0.25s_ease-out] motion-reduce:animate-none"
          viewBox="0 0 100 100"
          fill="none"
          aria-hidden="true"
        >
          <circle
            cx="50"
            cy="50"
            r="46"
            className="stroke-emerald-500 fill-[#D1FAE5]"
            strokeWidth="6"
          />
          <path
            d="M30 52 L44 66 L70 36"
            className="stroke-emerald-600 stroke-[7px]"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      {/* Success Title */}
      <h1 className="text-3xl font-extrabold text-[#1E293B] mb-2 font-heading">
        Order Safal Raha!
      </h1>
      <p className="text-slate-500 text-sm mb-6 max-w-sm">
        Aapka wholesale order successfully receive ho chuka hai. Email par bill aur confirmation bheja ja raha hai.
      </p>

      {/* ── Order details box ── */}
      <div className="w-full bg-[#F8FAFC] border border-slate-200 rounded-2xl p-6 mb-8 space-y-4 shadow-sm">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Order Number</span>
          <p className="text-2xl font-extrabold text-[#2563EB] tracking-wide mt-1" id="confirmation-order-number">
            VN-{orderNumber}
          </p>
        </div>
        
        <div className="border-t border-slate-200 pt-4 flex justify-between items-center text-left">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Delivery Estimate</span>
            <p className="text-sm font-bold text-slate-700 mt-0.5">2–5 business days</p>
          </div>
          <span className="text-xs bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full font-bold uppercase border border-emerald-100">
            Confirmed
          </span>
        </div>
      </div>

      {/* ── Actions ── */}
      <div className="flex flex-col sm:flex-row gap-4 w-full">
        {/* Track Order Stub */}
        <button
          id="confirmation-track-btn"
          disabled
          className="flex-1 bg-[#2563EB] text-white font-bold py-3.5 px-6 rounded-xl transition-all shadow-md opacity-50 cursor-not-allowed text-sm"
          title="Tracking dashboard coming in Sprint 5"
        >
          Track Order (Sprint 5)
        </button>

        {/* Continue shopping */}
        <Link
          id="confirmation-continue-btn"
          href="/search"
          className="flex-1 border border-slate-200 text-slate-700 hover:bg-slate-50 font-bold py-3.5 px-6 rounded-xl transition-all text-sm flex items-center justify-center"
        >
          Continue Shopping
        </Link>
      </div>

      {/* Embed Tailwind custom animations in style tag to respect reduced motion */}
      <style jsx global>{`
        @keyframes scaleIn {
          0% {
            transform: scale(0.3);
            opacity: 0;
          }
          100% {
            transform: scale(1);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}

export default function ConfirmationPage(): React.JSX.Element {
  return (
    <Suspense
      fallback={
        <div className="min-h-[70vh] flex flex-col items-center justify-center max-w-xl mx-auto px-4 py-16 text-center">
          <div className="w-20 h-20 bg-slate-200 rounded-full animate-pulse mb-6" />
          <div className="h-8 bg-slate-200 rounded w-1/2 animate-pulse mb-4 mx-auto" />
          <div className="h-32 bg-slate-100 rounded-2xl w-full animate-pulse" />
        </div>
      }
    >
      <ConfirmationPageInner />
    </Suspense>
  );
}
