/**
 * ProductCardSkeleton — apps/web/components/buyer/ProductCardSkeleton.tsx
 *
 * Shimmer skeleton loader for product cards.
 * Matches ProductCard layout exactly to prevent CLS (Cumulative Layout Shift).
 */

import React from 'react';

function ShimmerBar({ className }: { className?: string }): React.JSX.Element {
  return (
    <div
      className={`bg-gradient-to-r from-[#E2E8F0] via-[#F8FAFC] to-[#E2E8F0] bg-[length:200%_100%] animate-[shimmer_1.5s_infinite] rounded ${className ?? ''}`}
      style={{
        animation: 'shimmer 1.5s infinite',
        backgroundSize: '200% 100%',
      }}
      aria-hidden="true"
    />
  );
}

export default function ProductCardSkeleton(): React.JSX.Element {
  return (
    <div
      className="bg-white rounded-lg border border-[#E2E8F0] overflow-hidden"
      role="status"
      aria-label="Loading product"
    >
      {/* Image skeleton */}
      <div className="aspect-square bg-[#F8FAFC]">
        <ShimmerBar className="w-full h-full rounded-none" />
      </div>

      {/* Content skeleton */}
      <div className="p-3 space-y-2">
        {/* Product name */}
        <ShimmerBar className="h-4 w-full" />
        <ShimmerBar className="h-4 w-3/4" />

        {/* Category */}
        <ShimmerBar className="h-3 w-1/2" />

        {/* Price */}
        <ShimmerBar className="h-5 w-1/3" />

        {/* MOQ + freshness */}
        <div className="flex justify-between">
          <ShimmerBar className="h-5 w-24" />
          <ShimmerBar className="h-3 w-16" />
        </div>
      </div>

      <style>{`
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
      `}</style>
    </div>
  );
}
