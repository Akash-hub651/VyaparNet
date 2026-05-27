'use client';

/**
 * BuyerNav — apps/web/components/buyer/BuyerNav.tsx
 *
 * Sticky navigation header with VyaparNet logo and integrated search bar.
 * Search input changes are synced to URL via useRouter/useSearchParams.
 * 300ms debounce on input to avoid excessive API calls.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Segment } from '@vyaparnet/types';
import Link from 'next/link';

const SEGMENTS = [
  { value: Segment.TEXTILE, label: 'Textile' },
  { value: Segment.SPARE_PARTS, label: 'Spare Parts' },
];

export default function BuyerNav(): React.JSX.Element {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const currentQ = searchParams.get('q') ?? '';
  const currentSegment = (searchParams.get('segment') as Segment) ?? Segment.TEXTILE;

  const [inputValue, setInputValue] = useState(currentQ);
  const [selectedSegment, setSelectedSegment] = useState<Segment>(currentSegment);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync URL → input when URL changes externally (browser back/forward)
  useEffect(() => {
    setInputValue(searchParams.get('q') ?? '');
    setSelectedSegment((searchParams.get('segment') as Segment) ?? Segment.TEXTILE);
  }, [searchParams]);

  const pushSearch = useCallback(
    (q: string, segment: Segment) => {
      const params = new URLSearchParams(searchParams.toString());
      if (q) {
        params.set('q', q);
      } else {
        params.delete('q');
      }
      params.set('segment', segment);
      // Reset cursor on new search
      params.delete('cursorId');
      params.delete('cursorCreatedAt');
      router.push(`/search?${params.toString()}`);
    },
    [router, searchParams],
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const val = e.target.value;
    setInputValue(val);

    // 300ms debounce before updating URL
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (val.trim().length >= 2) {
        pushSearch(val.trim(), selectedSegment);
      }
    }, 300);
  };

  const handleSegmentChange = (seg: Segment): void => {
    setSelectedSegment(seg);
    if (inputValue.trim()) {
      pushSearch(inputValue.trim(), seg);
    }
  };

  const handleSubmit = (e: React.FormEvent): void => {
    e.preventDefault();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (inputValue.trim()) {
      pushSearch(inputValue.trim(), selectedSegment);
    }
  };

  const isOnSearch = pathname?.startsWith('/search');

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-[#E2E8F0] shadow-sm h-16">
      <div className="max-w-7xl mx-auto px-4 h-full flex items-center gap-3">
        {/* Logo */}
        <Link
          href="/"
          className="flex-shrink-0 flex items-center gap-2 text-[#2563EB] font-bold text-lg font-heading"
          aria-label="VyaparNet — Go to homepage"
        >
          <svg
            width="28"
            height="28"
            viewBox="0 0 28 28"
            fill="none"
            aria-hidden="true"
          >
            <rect width="28" height="28" rx="6" fill="#2563EB" />
            <text x="5" y="20" fill="white" fontSize="14" fontWeight="700" fontFamily="sans-serif">
              VN
            </text>
          </svg>
          <span className="hidden sm:block">VyaparNet</span>
        </Link>

        {/* Segment selector + Search bar */}
        <form
          onSubmit={handleSubmit}
          className="flex flex-1 items-center max-w-2xl"
          role="search"
          aria-label="Product search"
        >
          {/* Segment dropdown */}
          <select
            id="nav-segment-select"
            value={selectedSegment}
            onChange={(e) => handleSegmentChange(e.target.value as Segment)}
            className="h-10 px-2 border border-r-0 border-[#E2E8F0] rounded-l-lg bg-[#F8FAFC] text-[#1E293B] text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#2563EB] cursor-pointer flex-shrink-0"
            aria-label="Select market segment"
          >
            {SEGMENTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>

          {/* Search input */}
          <div className="relative flex-1">
            <input
              id="nav-search-input"
              type="search"
              value={inputValue}
              onChange={handleInputChange}
              placeholder="Search products, categories…"
              className="w-full h-10 pl-4 pr-10 border border-[#E2E8F0] text-sm text-[#1E293B] placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:border-transparent transition-all"
              aria-label="Search query"
              autoComplete="off"
            />
          </div>

          {/* Submit button */}
          <button
            id="nav-search-submit"
            type="submit"
            className="h-10 px-4 bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded-r-lg transition-colors flex items-center gap-1.5 text-sm font-medium flex-shrink-0"
            aria-label="Search"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.5" />
              <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <span className="hidden sm:block">खोजें</span>
          </button>
        </form>

        {/* Right side actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {!isOnSearch && (
            <Link
              href="/search?segment=TEXTILE"
              className="text-sm text-[#2563EB] hover:text-[#1D4ED8] font-medium transition-colors hidden md:block"
            >
              Browse All
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
