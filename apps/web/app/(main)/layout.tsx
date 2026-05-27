/**
 * Buyer Layout — apps/web/app/(main)/layout.tsx
 *
 * Authority: SPRINT2_IMPLEMENTATION_LOCKED_final_v2.0.md Section 9.2
 *
 * Shared layout for all buyer-facing pages (search, product detail, home).
 * BuyerNav uses useSearchParams — must be wrapped in Suspense boundary.
 */

import React, { Suspense } from 'react';
import type { Metadata } from 'next';
import BuyerNav from '../../components/buyer/BuyerNav';

export const metadata: Metadata = {
  title: 'VyaparNet — Bharat ka B2B Marketplace',
  description: 'Verified wholesale products. Segment-isolated discovery for Bharat retailers.',
};

function BuyerNavSuspense(): React.JSX.Element {
  return (
    <Suspense fallback={<div className="h-16 bg-white border-b border-[#E2E8F0]" aria-hidden="true" />}>
      <BuyerNav />
    </Suspense>
  );
}

export default function BuyerLayout({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      {/* Sticky header — BuyerNav wrapped in Suspense for useSearchParams */}
      <BuyerNavSuspense />
      {/* Main content area — top padding clears the 64px sticky nav */}
      <main className="pt-[64px]">
        {children}
      </main>
    </div>
  );
}
