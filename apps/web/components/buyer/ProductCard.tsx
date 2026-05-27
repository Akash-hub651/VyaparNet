/**
 * ProductCard — apps/web/components/buyer/ProductCard.tsx
 *
 * Buyer-facing product card for the search results grid.
 * Renders lastIndexedAt freshness badge from API.
 * Price in Indian locale (₹ Intl.NumberFormat).
 */

import React from 'react';
import Link from 'next/link';
import type { SearchProductDocument } from '../../lib/api/search.client';

interface ProductCardProps {
  product: SearchProductDocument;
  lastIndexedLabel: string;
}

const inrFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export default function ProductCard({ product, lastIndexedLabel }: ProductCardProps): React.JSX.Element {
  const primaryImage = product.media?.find((m) => m.mediaClass === 'PRODUCT_IMAGE') ?? product.media?.[0];
  const hasDiscount = product.mrp && product.mrp > product.basePrice;
  const discountPct = hasDiscount
    ? Math.round(((product.mrp! - product.basePrice) / product.mrp!) * 100)
    : 0;

  return (
    <Link
      href={`/products/${product.slug}`}
      id={`product-card-${product.productId}`}
      className="group block bg-white rounded-lg border border-[#E2E8F0] hover:border-[#2563EB] hover:shadow-md transition-all duration-200 overflow-hidden"
      aria-label={`View ${product.name}`}
    >
      {/* Product image */}
      <div className="relative aspect-square bg-[#F8FAFC] overflow-hidden">
        {primaryImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={primaryImage.url}
            alt={product.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <svg width="40" height="40" viewBox="0 0 40 40" fill="none" className="text-[#E2E8F0]">
              <rect width="40" height="40" rx="4" fill="currentColor" />
              <path d="M8 30L16 18L22 26L26 20L32 30H8Z" fill="white" />
              <circle cx="27" cy="14" r="4" fill="white" />
            </svg>
          </div>
        )}

        {/* Discount badge */}
        {hasDiscount && (
          <div className="absolute top-2 left-2 bg-[#EF4444] text-white text-xs font-semibold px-1.5 py-0.5 rounded">
            -{discountPct}%
          </div>
        )}

        {/* Verified badge */}
        {product.sellerVerified && (
          <div className="absolute top-2 right-2 bg-[#10B981] rounded-full p-0.5" title="Verified Seller">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M2 6L5 9L10 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        )}
      </div>

      {/* Card body */}
      <div className="p-3">
        {/* Product name */}
        <h3 className="text-sm font-semibold text-[#1E293B] line-clamp-2 group-hover:text-[#2563EB] transition-colors leading-snug mb-1">
          {product.name}
        </h3>

        {/* Category */}
        {product.categoryName && (
          <p className="text-xs text-[#94A3B8] mb-2 truncate">{product.categoryName}</p>
        )}

        {/* Price */}
        <div className="flex items-baseline gap-1.5 mb-1">
          <span className="text-base font-bold text-[#1E293B]">
            {inrFormatter.format(product.basePrice)}
          </span>
          {hasDiscount && (
            <span className="text-xs text-[#94A3B8] line-through">
              {inrFormatter.format(product.mrp!)}
            </span>
          )}
        </div>

        {/* MOQ badge */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-[#64748B] bg-[#F8FAFC] border border-[#E2E8F0] rounded px-1.5 py-0.5">
            Min: {product.moq} {product.unit}
          </span>

          {/* lastIndexedAt freshness */}
          {lastIndexedLabel && (
            <span className="text-[10px] text-[#94A3B8]" title="Price freshness">
              {lastIndexedLabel}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
