/**
 * Buyer Product Detail Page — apps/web/app/(main)/products/[slug]/page.tsx
 *
 * Authority: SPRINT2_IMPLEMENTATION_LOCKED_final_v2.0.md Section 9.3
 *
 * - Server Component with revalidate: 60s (ISR)
 * - Swipeable image gallery respecting displayOrder
 * - segmentAttributes rendered dynamically from API schema — NO hardcoded segment checks
 * - Price in Indian locale, MRP strikethrough, MOQ badge
 * - lastIndexedAt: "Price last updated X mins ago"
 * - Category breadcrumb
 */

import React from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getProduct } from '../../../../lib/api/products.client';
import ProductGallery from '../../../../components/buyer/ProductGallery';
import SegmentAttributeDisplay from '../../../../components/buyer/SegmentAttributeDisplay';
import StockStatus from '../../../../components/buyer/StockStatus';

// ─────────────────────────────────────────────────────────────
// ISR: revalidate every 60 seconds
// ─────────────────────────────────────────────────────────────
export const revalidate = 60;

// ─────────────────────────────────────────────────────────────
// Dynamic metadata
// ─────────────────────────────────────────────────────────────
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const res = await getProduct(slug);
  if (!res.data) {
    return { title: 'Product Not Found — VyaparNet' };
  }
  return {
    title: `${res.data.name} — VyaparNet`,
    description: res.data.description ?? `Buy ${res.data.name} wholesale on VyaparNet. MOQ: ${res.data.moq} ${res.data.unit}.`,
  };
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

const inrFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

function formatRelativeTime(isoDate?: string | null): string {
  if (!isoDate) return '';
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ─────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────
export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<React.JSX.Element> {
  const { slug } = await params;
  const res = await getProduct(slug);

  if (!res.data) {
    notFound();
  }

  const product = res.data;
  const hasDiscount = product.mrp && product.mrp > product.basePrice;
  const discountPct = hasDiscount
    ? Math.round(((product.mrp! - product.basePrice) / product.mrp!) * 100)
    : 0;

  // Sort media by displayOrder (displayOrder is deterministic per spec 9.3)
  const sortedMedia = [...(product.media ?? [])].sort((a, b) => a.displayOrder - b.displayOrder);

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* ── Breadcrumb ─────────────────────────────────────── */}
      {product.categoryPath && product.categoryPath.length > 0 && (
        <nav aria-label="Breadcrumb" className="mb-6">
          <ol className="flex items-center gap-1.5 text-sm text-[#64748B]">
            <li>
              <a href="/" className="hover:text-[#2563EB] transition-colors">Home</a>
            </li>
            {product.categoryPath.map((cat, i) => (
              <React.Fragment key={cat.id}>
                <li aria-hidden="true" className="text-[#E2E8F0]">/</li>
                <li>
                  {i === product.categoryPath!.length - 1 ? (
                    <span className="text-[#1E293B] font-medium">{cat.name}</span>
                  ) : (
                    <a
                      href={`/search?categoryId=${cat.id}&segment=${product.segment}`}
                      className="hover:text-[#2563EB] transition-colors"
                    >
                      {cat.name}
                    </a>
                  )}
                </li>
              </React.Fragment>
            ))}
          </ol>
        </nav>
      )}

      {/* ── Main content grid ─────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">

        {/* ── Left: Image gallery ─────────────────────────── */}
        <div>
          <ProductGallery media={sortedMedia} productName={product.name} />
        </div>

        {/* ── Right: Product info ──────────────────────────── */}
        <div className="space-y-5">
          {/* Seller info */}
          {product.sellerName && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-[#64748B]">by</span>
              <span className="text-sm font-medium text-[#1E293B]">{product.sellerName}</span>
              {product.sellerVerified && (
                <span className="inline-flex items-center gap-1 text-xs bg-[#D1FAE5] text-[#065F46] px-2 py-0.5 rounded-full font-medium">
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path d="M1.5 5L4 7.5L8.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Verified Seller
                </span>
              )}
            </div>
          )}

          {/* Product name */}
          <h1 className="text-2xl font-bold text-[#1E293B] leading-tight">
            {product.name}
          </h1>

          {/* Price block */}
          <div className="bg-[#F8FAFC] rounded-lg p-4 border border-[#E2E8F0]">
            <div className="flex items-baseline gap-3">
              <span className="text-3xl font-bold text-[#1E293B]">
                {inrFormatter.format(product.basePrice)}
              </span>
              {hasDiscount && (
                <>
                  <span className="text-lg text-[#94A3B8] line-through">
                    {inrFormatter.format(product.mrp!)}
                  </span>
                  <span className="text-sm font-semibold text-[#10B981] bg-[#D1FAE5] px-2 py-0.5 rounded">
                    {discountPct}% off
                  </span>
                </>
              )}
            </div>
            <p className="text-xs text-[#64748B] mt-1">Exclusive of applicable taxes</p>

            {/* MOQ and Stock Status badges */}
            <div className="mt-3 flex items-center flex-wrap gap-2">
              <StockStatus productId={product.id} segment={product.segment} />
              <span className="inline-flex items-center text-sm font-medium bg-[#EFF6FF] text-[#2563EB] px-3 py-1 rounded-full border border-[#BFDBFE]">
                Min. Order: {product.moq} {product.unit}
              </span>
              {product.gstPercent !== null && product.gstPercent !== undefined && (
                <span className="text-xs text-[#64748B] bg-white border border-[#E2E8F0] px-2 py-1 rounded-full">
                  GST {product.gstPercent}%
                </span>
              )}
            </div>

            {/* lastIndexedAt freshness */}
            {product.lastIndexedAt && (
              <p className="mt-2 text-xs text-[#94A3B8]">
                Price last updated {formatRelativeTime(product.lastIndexedAt)}
              </p>
            )}
          </div>

          {/* Description */}
          {product.description && (
            <div>
              <h2 className="text-sm font-semibold text-[#1E293B] mb-1.5">Description</h2>
              <p className="text-sm text-[#64748B] leading-relaxed whitespace-pre-line">
                {product.description}
              </p>
            </div>
          )}

          {/* Segment attributes — rendered dynamically, ZERO hardcoded if/switch per segment */}
          <SegmentAttributeDisplay
            segmentAttributes={product.segmentAttributes}
            segment={product.segment}
          />

          {/* Tags */}
          {product.tags && product.tags.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-[#1E293B] mb-1.5">Tags</h2>
              <div className="flex flex-wrap gap-1.5">
                {product.tags.map((tag) => (
                  <a
                    key={tag}
                    href={`/search?q=${encodeURIComponent(tag)}&segment=${product.segment}`}
                    className="text-xs text-[#64748B] bg-[#F8FAFC] border border-[#E2E8F0] px-2 py-0.5 rounded hover:border-[#2563EB] hover:text-[#2563EB] transition-colors"
                  >
                    #{tag}
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* HSN Code */}
          {product.hsnCode && (
            <p className="text-xs text-[#94A3B8]">HSN Code: {product.hsnCode}</p>
          )}

          {/* CTA buttons (stubs — order/cart in Sprint 4) */}
          <div className="flex gap-3 pt-2">
            <button
              id="product-detail-add-to-order"
              disabled
              className="flex-1 bg-[#2563EB] text-white font-semibold py-3 px-6 rounded-lg opacity-50 cursor-not-allowed transition-all text-sm"
              title="Cart & Orders coming in Sprint 4"
            >
              Add to Order
            </button>
            <button
              id="product-detail-request-quote"
              disabled
              className="flex-1 border-2 border-[#2563EB] text-[#2563EB] font-semibold py-3 px-6 rounded-lg opacity-50 cursor-not-allowed transition-all text-sm"
              title="Quotation coming in Sprint 5"
            >
              Request Quote
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
