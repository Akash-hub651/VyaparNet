import React from "react";
import Image from "next/image";
import Link from "next/link";
import { TopProductViewModel } from "../../../../lib/api/analytics.client";
import { formatAmount } from "../../../../lib/formatters";
import { Skeleton } from "../../../../components/ui/Skeleton";
import { getSegmentLabel } from "../../../../lib/segments";

interface TopProductsTableProps {
  products: TopProductViewModel[] | null;
  periodLabel: string;
  isLoading: boolean;
  error: string | null;
}

export function TopProductsTable({
  products,
  periodLabel,
  isLoading,
  error,
}: TopProductsTableProps) {
  return (
    <div className="bg-surface-card border border-border-default rounded-xl shadow-1 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border-default">
        <div>
          <h2 className="text-base font-semibold text-text-primary">
            Top Products by Revenue
          </h2>
          <p className="text-xs text-text-secondary mt-0.5">
            {periodLabel} ke liye
          </p>
        </div>
        <button
          disabled={isLoading || !products || products.length === 0}
          className="self-start sm:self-auto flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-brand-600 hover:bg-brand-50 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Export
        </button>
      </div>

      {/* Desktop Table (Hidden on Mobile) */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-surface-base border-b border-border-default text-xs font-semibold text-text-secondary">
              <th className="px-5 py-3 w-12 text-center">Rank</th>
              <th className="px-5 py-3">Product</th>
              <th className="px-5 py-3 w-28">Segment</th>
              <th className="px-5 py-3 w-24 text-right">Orders</th>
              <th className="px-5 py-3 w-32 text-right">Revenue</th>
              <th className="px-5 py-3 w-32 text-right">Avg Price</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-default">
            {isLoading ? (
              <>
                <LoadingRow />
                <LoadingRow />
                <LoadingRow />
                <LoadingRow />
                <LoadingRow />
              </>
            ) : error ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-5 py-8 text-center text-sm font-medium text-error-700"
                >
                  {error}
                </td>
              </tr>
            ) : !products || products.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-5 py-10 text-center text-sm text-text-secondary"
                >
                  Is period mein koi order nahi hua.
                </td>
              </tr>
            ) : (
              products.slice(0, 10).map((product, index) => {
                const rank = index + 1;
                const isTop3 = rank <= 3;
                const avgPrice =
                  product.orders > 0 ? product.revenue / product.orders : 0;

                return (
                  <tr
                    key={product.id}
                    className="hover:bg-surface-hover transition-colors group"
                  >
                    <td className="px-5 py-3 align-middle text-center">
                      <span
                        className={`text-sm font-bold ${isTop3 ? "text-accent-600" : "text-text-secondary"}`}
                      >
                        {rank}
                      </span>
                    </td>
                    <td className="px-5 py-3 align-middle min-w-[250px]">
                      <Link
                        href={`/products/${product.id}/edit`}
                        className="flex items-center gap-3 outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded-md"
                      >
                        <Image
                          src={product.thumbnailUrl || ''}
                          alt=""
                          width={32}
                          height={32}
                          className={`w-8 h-8 rounded object-cover flex-shrink-0 border border-border-default bg-surface-base ${!product.thumbnailUrl ? 'opacity-0 absolute' : ''}`}
                          unoptimized
                        />
                        {!product.thumbnailUrl && (
                          <span className="w-8 h-8 rounded flex-shrink-0 border border-border-default bg-neutral-100 flex items-center justify-center" aria-hidden="true">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-neutral-400">
                              <rect x="3" y="3" width="18" height="18" rx="2" />
                              <circle cx="8.5" cy="8.5" r="1.5" />
                              <polyline points="21 15 16 10 5 21" />
                            </svg>
                          </span>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-text-primary group-hover:text-brand-600 transition-colors truncate">
                            {product.name}
                          </p>
                          <p className="text-[10px] text-text-muted mt-0.5 truncate uppercase">
                            SKU: {product.sku}
                          </p>
                        </div>
                      </Link>
                    </td>
                    <td className="px-5 py-3 align-middle">
                      {/**
                       * D-03 FIX — Segment Isolation
                       * Authority: seller_dashboard_architecture.md §21
                       * Removed hardcoded `as "TEXTILE" | "SPARE_PARTS"` cast.
                       * getSegmentLabel() resolves any segment key to a human label
                       * without hardcoding segment values in the UI layer.
                       */}
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-neutral-100 text-neutral-700">
                        {getSegmentLabel(product.segment)}
                      </span>
                    </td>
                    <td className="px-5 py-3 align-middle text-right">
                      <span className="text-sm tabular-nums text-text-primary">
                        {product.orders}
                      </span>
                    </td>
                    <td className="px-5 py-3 align-middle text-right">
                      <span className="text-sm font-semibold tabular-nums text-text-primary">
                        {formatAmount(product.revenue)}
                      </span>
                    </td>
                    <td className="px-5 py-3 align-middle text-right">
                      <span className="text-sm tabular-nums text-text-secondary">
                        {formatAmount(avgPrice)}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile List View (Hidden on Desktop) */}
      <div className="block md:hidden divide-y divide-border-default">
        {isLoading ? (
          <>
            <LoadingMobileCard />
            <LoadingMobileCard />
            <LoadingMobileCard />
          </>
        ) : error ? (
          <div className="p-6 text-center text-sm font-medium text-error-700">
            {error}
          </div>
        ) : !products || products.length === 0 ? (
          <div className="p-8 text-center text-sm text-text-secondary">
            Is period mein koi order nahi hua.
          </div>
        ) : (
          products.slice(0, 10).map((product, index) => (
            <Link
              key={product.id}
              href={`/products/${product.id}/edit`}
              className="flex items-center justify-between p-4 hover:bg-surface-hover active:bg-surface-pressed transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0 pr-4">
                <span
                  className={`text-xs font-bold w-4 flex-shrink-0 text-center ${index < 3 ? "text-accent-600" : "text-text-muted"}`}
                >
                  {index + 1}
                </span>
                <Image
                  src={product.thumbnailUrl || ''}
                  alt=""
                  width={40}
                  height={40}
                  className={`w-10 h-10 rounded-md object-cover flex-shrink-0 border border-border-default bg-surface-base ${!product.thumbnailUrl ? 'opacity-0 absolute' : ''}`}
                  unoptimized
                />
                {!product.thumbnailUrl && (
                  <span className="w-10 h-10 rounded-md flex-shrink-0 border border-border-default bg-neutral-100 flex items-center justify-center" aria-hidden="true">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-neutral-400">
                      <rect x="3" y="3" width="18" height="18" rx="2" />
                      <circle cx="8.5" cy="8.5" r="1.5" />
                      <polyline points="21 15 16 10 5 21" />
                    </svg>
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-text-primary truncate">
                    {product.name}
                  </p>
                  <p className="text-xs text-text-secondary mt-0.5">
                    {product.orders} orders
                  </p>
                </div>
              </div>
              <div className="flex flex-col items-end flex-shrink-0">
                <span className="text-sm font-bold text-text-primary tabular-nums">
                  {formatAmount(product.revenue)}
                </span>
              </div>
            </Link>
          ))
        )}
      </div>

      {/* Footer */}
      {products && products.length > 0 && (
        <div className="bg-surface-base border-t border-border-default px-5 py-3 text-center">
          <p className="text-xs text-text-secondary">
            Sab products ke analytics aage aayenge
          </p>
        </div>
      )}
    </div>
  );
}

function LoadingRow() {
  return (
    <tr>
      <td className="px-5 py-3">
        <Skeleton className="h-4 w-6 mx-auto" />
      </td>
      <td className="px-5 py-3">
        <div className="flex items-center gap-3">
          <Skeleton className="w-8 h-8 rounded flex-shrink-0" />
          <div className="space-y-1.5 flex-1">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      </td>
      <td className="px-5 py-3">
        <Skeleton className="h-6 w-16 rounded-full" />
      </td>
      <td className="px-5 py-3 text-right">
        <Skeleton className="h-4 w-8 ml-auto" />
      </td>
      <td className="px-5 py-3 text-right">
        <Skeleton className="h-4 w-16 ml-auto" />
      </td>
      <td className="px-5 py-3 text-right">
        <Skeleton className="h-4 w-12 ml-auto" />
      </td>
    </tr>
  );
}

function LoadingMobileCard() {
  return (
    <div className="p-4 flex items-center justify-between">
      <div className="flex items-center gap-3 flex-1">
        <Skeleton className="h-3 w-3 rounded-sm flex-shrink-0" />
        <Skeleton className="w-10 h-10 rounded-md flex-shrink-0" />
        <div className="space-y-2 flex-1">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/3" />
        </div>
      </div>
      <Skeleton className="h-5 w-16 ml-4" />
    </div>
  );
}
