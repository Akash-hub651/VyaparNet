'use client';

/**
 * Buyer Search Results Page — apps/web/app/(main)/search/page.tsx
 *
 * Authority: SPRINT2_IMPLEMENTATION_LOCKED_final_v2.0.md Section 9.2
 *
 * Features:
 * - URL sync: ?q=&segment=&sort=&categoryId=&minPrice=&maxPrice=
 * - 300ms debounce on search input (via BuyerNav, search is already URL-driven)
 * - Skeleton loaders (no CLS)
 * - Filter panel reads from category.filterConfig — NEVER hardcoded segment checks
 * - fallbackUsed=true → shows "संबंधित परिणाम दिखाए जा रहे हैं" banner
 * - lastIndexedAt per card: "Updated X mins ago"
 * - IntersectionObserver infinite scroll
 */

import React, { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Segment } from '@vyaparnet/types';
import { searchProducts, type SearchProductDocument } from '../../../lib/api/search.client';
import { getCategories, type CategoryResponse, type FilterConfigField } from '../../../lib/api/categories.client';
import ProductCard from '../../../components/buyer/ProductCard';
import ProductCardSkeleton from '../../../components/buyer/ProductCardSkeleton';
import FilterPanel from '../../../components/buyer/FilterPanel';

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function formatRelativeTime(isoDate?: string | null): string {
  if (!isoDate) return '';
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ─────────────────────────────────────────────────────────────
// Inner component (uses useSearchParams — must be inside Suspense)
// ─────────────────────────────────────────────────────────────

function SearchPageInner(): React.JSX.Element {
  const searchParams = useSearchParams();
  const router = useRouter();

  const q = searchParams.get('q') ?? '';
  const segment = (searchParams.get('segment') as Segment) ?? Segment.TEXTILE;
  const sort = searchParams.get('sort') ?? 'relevance';
  const categoryId = searchParams.get('categoryId') ?? undefined;
  const minPrice = searchParams.get('minPrice') ? Number(searchParams.get('minPrice')) : undefined;
  const maxPrice = searchParams.get('maxPrice') ? Number(searchParams.get('maxPrice')) : undefined;

  const [results, setResults] = useState<SearchProductDocument[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [fallbackUsed, setFallbackUsed] = useState(false);
  const [total, setTotal] = useState<number>(0);
  const [nextCursorId, setNextCursorId] = useState<string | null>(null);
  const [nextCursorCreatedAt, setNextCursorCreatedAt] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Categories for filter panel
  const [categories, setCategories] = useState<CategoryResponse[]>([]);
  const [filterFields, setFilterFields] = useState<FilterConfigField[]>([]);

  // IntersectionObserver sentinel
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // ── Fetch categories + filter config ──────────────────────

  useEffect(() => {
    void getCategories(segment).then((res) => {
      if (res.data) {
        setCategories(res.data);
        // If a specific category is selected, extract its filterConfig
        if (categoryId) {
          const cat = findCategoryById(res.data, categoryId);
          setFilterFields(cat?.filterConfig?.filters ?? []);
        } else {
          setFilterFields([]);
        }
      }
    });
  }, [segment, categoryId]);

  // ── Search ────────────────────────────────────────────────

  const performSearch = useCallback(
    async (reset: boolean, cursorId?: string, cursorCreatedAt?: string) => {
      if (!q.trim() && !categoryId) {
        setResults([]);
        setTotal(0);
        return;
      }

      if (reset) {
        setIsLoading(true);
        setResults([]);
      } else {
        setIsLoadingMore(true);
      }
      setError(null);

      const res = await searchProducts({
        q: q || '*',
        segment,
        sort: sort as 'relevance' | 'price_asc' | 'price_desc' | 'newest',
        categoryId,
        minPrice,
        maxPrice,
        cursorId,
        cursorCreatedAt,
        limit: 20,
      });

      if (res.error) {
        setError(res.error.message);
        setIsLoading(false);
        setIsLoadingMore(false);
        return;
      }

      const { data: searchData } = res;
      setFallbackUsed(searchData.fallbackUsed ?? false);
      setTotal(searchData.total);
      setNextCursorId(searchData.nextCursorId ?? null);
      setNextCursorCreatedAt(searchData.nextCursorCreatedAt ?? null);
      setHasMore(!!(searchData.nextCursorId));

      if (reset) {
        setResults(searchData.data);
        setIsLoading(false);
      } else {
        setResults((prev) => [...prev, ...searchData.data]);
        setIsLoadingMore(false);
      }
    },
    [q, segment, sort, categoryId, minPrice, maxPrice],
  );

  // Re-search whenever URL params change
  useEffect(() => {
    void performSearch(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, segment, sort, categoryId, minPrice, maxPrice]);

  // ── Infinite scroll via IntersectionObserver ──────────────

  useEffect(() => {
    if (!sentinelRef.current || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isLoadingMore) {
          void performSearch(false, nextCursorId ?? undefined, nextCursorCreatedAt ?? undefined);
        }
      },
      { rootMargin: '200px' },
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasMore, isLoadingMore, nextCursorId, nextCursorCreatedAt, performSearch]);

  // ── Filter URL update ──────────────────────────────────────

  const updateFilter = (key: string, value: string | undefined): void => {
    const params = new URLSearchParams(searchParams.toString());
    if (value !== undefined && value !== '') {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    params.delete('cursorId');
    params.delete('cursorCreatedAt');
    router.push(`/search?${params.toString()}`);
  };

  // ── Render ─────────────────────────────────────────────────

  const showSkeletons = isLoading;
  const showEmpty = !isLoading && results.length === 0 && !error && q;

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      {/* ── Fallback banner ── */}
      {fallbackUsed && (
        <div
          id="search-fallback-banner"
          className="mb-4 px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-2"
          role="status"
          aria-live="polite"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-amber-500 flex-shrink-0">
            <path d="M8 2L14 13H2L8 2Z" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinejoin="round" />
            <path d="M8 7V9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <circle cx="8" cy="11" r="0.5" fill="currentColor" />
          </svg>
          <span className="text-sm text-amber-800">संबंधित परिणाम दिखाए जा रहे हैं</span>
        </div>
      )}

      {/* ── Result count ── */}
      {!isLoading && q && (
        <p className="text-sm text-[#64748B] mb-4" aria-live="polite">
          {total > 0 ? (
            <>
              <span className="font-semibold text-[#1E293B]">{total.toLocaleString('en-IN')}</span>{' '}
              results for &ldquo;<span className="font-medium text-[#2563EB]">{q}</span>&rdquo;
            </>
          ) : (
            <>No results found for &ldquo;<span className="font-medium">{q}</span>&rdquo;</>
          )}
        </p>
      )}

      <div className="flex gap-6">
        {/* ── Filter panel (left) — driven by filterConfig, never hardcoded ── */}
        <aside className="hidden lg:block w-56 flex-shrink-0">
          <FilterPanel
            categories={categories}
            selectedCategoryId={categoryId}
            filterFields={filterFields}
            searchParams={searchParams}
            onFilterChange={updateFilter}
            segment={segment}
          />
        </aside>

        {/* ── Product grid (main) ── */}
        <div className="flex-1 min-w-0">
          {/* Sort bar */}
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm text-[#64748B]">
              {!isLoading && results.length > 0 ? `Showing ${results.length} of ${total}` : ''}
            </span>
            <div className="flex items-center gap-2">
              <label htmlFor="sort-select" className="text-sm text-[#64748B]">Sort:</label>
              <select
                id="sort-select"
                value={sort}
                onChange={(e) => updateFilter('sort', e.target.value)}
                className="text-sm border border-[#E2E8F0] rounded-lg px-2 py-1.5 text-[#1E293B] focus:outline-none focus:ring-2 focus:ring-[#2563EB] bg-white"
              >
                <option value="relevance">Relevance</option>
                <option value="price_asc">Price: Low to High</option>
                <option value="price_desc">Price: High to Low</option>
                <option value="newest">Newest First</option>
              </select>
            </div>
          </div>

          {/* Error state */}
          {error && (
            <div
              id="search-error"
              className="py-12 text-center"
              role="alert"
            >
              <p className="text-[#EF4444] text-sm">{error}</p>
              <button
                onClick={() => void performSearch(true)}
                className="mt-3 text-sm text-[#2563EB] hover:text-[#1D4ED8] font-medium"
              >
                Try again
              </button>
            </div>
          )}

          {/* Empty state */}
          {showEmpty && !error && (
            <div id="search-empty" className="py-16 text-center">
              <div className="text-5xl mb-4">🔍</div>
              <h2 className="text-lg font-semibold text-[#1E293B] mb-2">
                कोई परिणाम नहीं मिला
              </h2>
              <p className="text-[#64748B] text-sm max-w-sm mx-auto">
                &ldquo;{q}&rdquo; के लिए कोई उत्पाद नहीं मिला। दूसरे keywords आज़माएं।
              </p>
            </div>
          )}

          {/* Product grid — 2-col mobile, 3-col desktop */}
          {!error && (
            <div
              id="search-results-grid"
              className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 gap-4"
              aria-label="Search results"
            >
              {/* Skeleton placeholders during initial load */}
              {showSkeletons &&
                Array.from({ length: 6 }).map((_, i) => (
                  <ProductCardSkeleton key={`skeleton-${i}`} />
                ))}

              {/* Actual product cards */}
              {!showSkeletons &&
                results.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    lastIndexedLabel={formatRelativeTime(product.lastIndexedAt)}
                  />
                ))}

              {/* Load more skeletons */}
              {isLoadingMore &&
                Array.from({ length: 3 }).map((_, i) => (
                  <ProductCardSkeleton key={`more-skeleton-${i}`} />
                ))}
            </div>
          )}

          {/* Infinite scroll sentinel */}
          {hasMore && <div ref={sentinelRef} className="h-8 mt-4" aria-hidden="true" />}

          {/* End of results */}
          {!isLoading && !isLoadingMore && !hasMore && results.length > 0 && (
            <div className="text-center py-8 text-sm text-[#94A3B8]">
              — सभी परिणाम दिखाए गए —
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Helper: find category in tree by ID
// ─────────────────────────────────────────────────────────────

function findCategoryById(cats: CategoryResponse[], id: string): CategoryResponse | undefined {
  for (const cat of cats) {
    if (cat.id === id) return cat;
    if (cat.children) {
      const found = findCategoryById(cat.children, id);
      if (found) return found;
    }
  }
  return undefined;
}

// ─────────────────────────────────────────────────────────────
// Exported page (Suspense wrapper required for useSearchParams)
// ─────────────────────────────────────────────────────────────

export default function SearchPage(): React.JSX.Element {
  return (
    <Suspense
      fallback={
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <ProductCardSkeleton key={`init-skeleton-${i}`} />
            ))}
          </div>
        </div>
      }
    >
      <SearchPageInner />
    </Suspense>
  );
}
