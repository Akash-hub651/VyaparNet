'use client';

/**
 * ProductGallery — apps/web/components/buyer/ProductGallery.tsx
 *
 * Swipeable image gallery for product detail page.
 * displayOrder is respected — images sorted before this component is called.
 * Supports touch swipe and thumbnail navigation.
 */

import React, { useState, useRef } from 'react';
import type { ProductMediaResponse } from '../../lib/api/products.client';

interface ProductGalleryProps {
  media: ProductMediaResponse[];
  productName: string;
}

export default function ProductGallery({ media, productName }: ProductGalleryProps): React.JSX.Element {
  const [activeIndex, setActiveIndex] = useState(0);
  const touchStartX = useRef<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent): void => {
    touchStartX.current = e.touches[0]?.clientX ?? null;
  };

  const handleTouchEnd = (e: React.TouchEvent): void => {
    if (touchStartX.current === null) return;
    const diff = touchStartX.current - (e.changedTouches[0]?.clientX ?? 0);
    if (Math.abs(diff) > 40) {
      if (diff > 0) {
        // swipe left → next
        setActiveIndex((i) => Math.min(i + 1, media.length - 1));
      } else {
        // swipe right → prev
        setActiveIndex((i) => Math.max(i - 1, 0));
      }
    }
    touchStartX.current = null;
  };

  if (media.length === 0) {
    return (
      <div className="aspect-square bg-[#F8FAFC] rounded-xl flex items-center justify-center border border-[#E2E8F0]">
        <svg width="64" height="64" viewBox="0 0 64 64" fill="none" className="text-[#E2E8F0]">
          <rect width="64" height="64" rx="8" fill="currentColor" />
          <path d="M12 48L24 28L34 42L42 30L52 48H12Z" fill="white" />
          <circle cx="43" cy="22" r="6" fill="white" />
        </svg>
      </div>
    );
  }

  const activeMedia = media[activeIndex];

  return (
    <div className="space-y-3">
      {/* Main image */}
      <div
        className="relative aspect-square bg-[#F8FAFC] rounded-xl overflow-hidden border border-[#E2E8F0] select-none"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {activeMedia && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={activeMedia.url}
            alt={activeMedia.altText ?? `${productName} — image ${activeIndex + 1}`}
            className="w-full h-full object-contain transition-opacity duration-200"
            key={activeMedia.id}
          />
        )}

        {/* Navigation arrows */}
        {media.length > 1 && (
          <>
            <button
              id="gallery-prev"
              onClick={() => setActiveIndex((i) => Math.max(i - 1, 0))}
              disabled={activeIndex === 0}
              className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/80 backdrop-blur-sm border border-[#E2E8F0] flex items-center justify-center disabled:opacity-30 hover:bg-white transition-all shadow-sm"
              aria-label="Previous image"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M9 2L4 7L9 12" stroke="#1E293B" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <button
              id="gallery-next"
              onClick={() => setActiveIndex((i) => Math.min(i + 1, media.length - 1))}
              disabled={activeIndex === media.length - 1}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/80 backdrop-blur-sm border border-[#E2E8F0] flex items-center justify-center disabled:opacity-30 hover:bg-white transition-all shadow-sm"
              aria-label="Next image"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M5 2L10 7L5 12" stroke="#1E293B" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </>
        )}

        {/* Slide counter */}
        {media.length > 1 && (
          <div className="absolute bottom-2 right-2 text-xs bg-black/40 text-white px-2 py-0.5 rounded-full">
            {activeIndex + 1}/{media.length}
          </div>
        )}
      </div>

      {/* Thumbnail strip */}
      {media.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {media.map((m, i) => (
            <button
              key={m.id}
              id={`gallery-thumb-${i}`}
              onClick={() => setActiveIndex(i)}
              className={`flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 transition-all ${
                activeIndex === i
                  ? 'border-[#2563EB] shadow-sm'
                  : 'border-[#E2E8F0] hover:border-[#93C5FD]'
              }`}
              aria-label={`View image ${i + 1}`}
              aria-current={activeIndex === i ? 'true' : undefined}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={m.url}
                alt={m.altText ?? `${productName} thumbnail ${i + 1}`}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
