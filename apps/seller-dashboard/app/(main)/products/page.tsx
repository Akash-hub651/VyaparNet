'use client';

/**
 * Seller Product List — apps/seller-dashboard/app/(main)/products/page.tsx
 *
 * Authority: SPRINT2_IMPLEMENTATION_LOCKED_final_v2.0.md Section 9.4
 *
 * Features:
 * - Status tabs: All | Active | Pending | Rejected | Draft | Archived
 * - Status badge colors from design tokens
 * - Edit / Archive / Publish actions per row
 * - Empty state per tab with CTA
 */

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ProductStatus } from '@vyaparnet/types';
import { useAuth } from '../../contexts/auth.context';
import {
  getSellerProducts,
  archiveProduct,
  publishProduct,
  type ProductResponse,
} from '../../../lib/api/products.client';

// ─────────────────────────────────────────────────────────────
// Status badge config (design token colors)
// ─────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<ProductStatus, { label: string; className: string }> = {
  [ProductStatus.ACTIVE]: {
    label: 'Active',
    className: 'bg-[#D1FAE5] text-[#065F46]',
  },
  [ProductStatus.PENDING_APPROVAL]: {
    label: 'Pending',
    className: 'bg-[#FEF3C7] text-[#92400E]',
  },
  [ProductStatus.REJECTED]: {
    label: 'Rejected',
    className: 'bg-[#FEE2E2] text-[#991B1B]',
  },
  [ProductStatus.DRAFT]: {
    label: 'Draft',
    className: 'bg-[#F1F5F9] text-[#475569]',
  },
  [ProductStatus.ARCHIVED]: {
    label: 'Archived',
    className: 'bg-[#F1F5F9] text-[#94A3B8]',
  },
};

// ─────────────────────────────────────────────────────────────
// Tabs
// ─────────────────────────────────────────────────────────────

interface Tab {
  label: string;
  status: ProductStatus | undefined;
  id: string;
}

const TABS: Tab[] = [
  { label: 'All', status: undefined, id: 'tab-all' },
  { label: 'Active', status: ProductStatus.ACTIVE, id: 'tab-active' },
  { label: 'Pending', status: ProductStatus.PENDING_APPROVAL, id: 'tab-pending' },
  { label: 'Rejected', status: ProductStatus.REJECTED, id: 'tab-rejected' },
  { label: 'Draft', status: ProductStatus.DRAFT, id: 'tab-draft' },
  { label: 'Archived', status: ProductStatus.ARCHIVED, id: 'tab-archived' },
];

// ─────────────────────────────────────────────────────────────
// Empty states per tab
// ─────────────────────────────────────────────────────────────

const EMPTY_STATE: Record<string, { emoji: string; title: string; cta?: string; ctaHref?: string }> = {
  all: {
    emoji: '📦',
    title: 'अभी तक कोई उत्पाद नहीं',
    cta: 'पहला उत्पाद जोड़ें',
    ctaHref: '/products/new',
  },
  active: { emoji: '✅', title: 'कोई active उत्पाद नहीं' },
  pending: { emoji: '⏳', title: 'Approval pending नहीं' },
  rejected: { emoji: '❌', title: 'कोई rejected उत्पाद नहीं' },
  draft: { emoji: '📝', title: 'कोई draft नहीं', cta: 'नया draft बनाएं', ctaHref: '/products/new' },
  archived: { emoji: '🗄️', title: 'कोई archived उत्पाद नहीं' },
};

const inrFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ─────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────

export default function SellerProductListPage(): React.JSX.Element {
  const { accessToken } = useAuth();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>(TABS[0]!);
  const [products, setProducts] = useState<ProductResponse[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const loadProducts = useCallback(async () => {
    if (!accessToken) return;
    setIsLoading(true);
    setError(null);
    const res = await getSellerProducts(
      { status: activeTab.status, limit: 50 },
      accessToken,
    );
    if (res.error) {
      setError(res.error.message);
    } else {
      setProducts(res.data?.data ?? []);
    }
    setIsLoading(false);
  }, [accessToken, activeTab]);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  const handleArchive = async (id: string): Promise<void> => {
    if (!accessToken) return;
    if (!confirm('क्या आप इस उत्पाद को archive करना चाहते हैं?')) return;
    setActionLoading(id);
    const res = await archiveProduct(id, accessToken);
    if (res.error) {
      alert(`Archive failed: ${res.error.message}`);
    } else {
      await loadProducts();
    }
    setActionLoading(null);
  };

  const handlePublish = async (id: string): Promise<void> => {
    if (!accessToken) return;
    setActionLoading(id);
    const res = await publishProduct(id, accessToken);
    if (res.error) {
      alert(`Publish failed: ${res.error.message}`);
    } else {
      await loadProducts();
    }
    setActionLoading(null);
  };

  const tabKey = activeTab.status?.toLowerCase() ?? 'all';
  const emptyState = EMPTY_STATE[tabKey] ?? EMPTY_STATE['all']!;

  return (
    <div>
      {/* Page title */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-h1 font-bold text-[#1E293B]">Products</h1>
        <Link
          id="seller-add-product-btn"
          href="/products/new"
          className="inline-flex items-center gap-2 bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-semibold text-sm px-4 py-2.5 rounded-lg transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M8 2V14M2 8H14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          Add Product
        </Link>
      </div>

      {/* Status tabs */}
      <div className="flex gap-1 border-b border-[#E2E8F0] mb-5 overflow-x-auto" role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            id={tab.id}
            role="tab"
            aria-selected={activeTab.id === tab.id}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors -mb-px ${
              activeTab.id === tab.id
                ? 'border-[#2563EB] text-[#2563EB]'
                : 'border-transparent text-[#64748B] hover:text-[#1E293B]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="bg-[#FEE2E2] border border-[#FECACA] rounded-lg px-4 py-3 text-sm text-[#991B1B] mb-4" role="alert">
          {error}
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-16 text-[#94A3B8]">
          <svg className="animate-spin w-6 h-6 mr-2" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" opacity="0.25" />
            <path d="M22 12a10 10 0 01-10 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          Loading…
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !error && products.length === 0 && (
        <div id={`empty-state-${tabKey}`} className="py-20 text-center">
          <div className="text-5xl mb-4">{emptyState.emoji}</div>
          <h2 className="text-base font-semibold text-[#1E293B] mb-2">{emptyState.title}</h2>
          {emptyState.cta && emptyState.ctaHref && (
            <Link
              href={emptyState.ctaHref}
              className="mt-3 inline-flex items-center gap-1.5 bg-[#2563EB] text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-[#1D4ED8] transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M7 1V13M1 7H13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              {emptyState.cta}
            </Link>
          )}
        </div>
      )}

      {/* Product table */}
      {!isLoading && products.length > 0 && (
        <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden">
          <table className="w-full text-sm" aria-label="Products list">
            <thead>
              <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC]">
                <th className="text-left px-4 py-3 text-xs font-semibold text-[#64748B] uppercase tracking-wide w-12">#</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-[#64748B] uppercase tracking-wide">Product</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-[#64748B] uppercase tracking-wide hidden md:table-cell">Category</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-[#64748B] uppercase tracking-wide hidden sm:table-cell">Price</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-[#64748B] uppercase tracking-wide">Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-[#64748B] uppercase tracking-wide hidden lg:table-cell">Created</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-[#64748B] uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product, i) => {
                const badge = STATUS_BADGE[product.status] ?? STATUS_BADGE[ProductStatus.DRAFT]!;
                const isActioning = actionLoading === product.id;

                return (
                  <tr
                    key={product.id}
                    id={`product-row-${product.id}`}
                    className="border-b border-[#F1F5F9] hover:bg-[#F8FAFC] transition-colors"
                  >
                    {/* Row number */}
                    <td className="px-4 py-3.5 text-[#94A3B8] text-xs">{i + 1}</td>

                    {/* Product name + slug */}
                    <td className="px-4 py-3.5">
                      <div className="font-medium text-[#1E293B] line-clamp-1">{product.name}</div>
                      <div className="text-xs text-[#94A3B8] mt-0.5 font-mono">{product.slug}</div>
                    </td>

                    {/* Category */}
                    <td className="px-4 py-3.5 text-[#64748B] hidden md:table-cell">
                      {product.categoryName ?? '—'}
                    </td>

                    {/* Price */}
                    <td className="px-4 py-3.5 text-right font-semibold text-[#1E293B] hidden sm:table-cell">
                      {inrFormatter.format(product.basePrice)}
                    </td>

                    {/* Status badge */}
                    <td className="px-4 py-3.5">
                      <span className={`inline-flex text-xs font-semibold px-2.5 py-1 rounded-full ${badge.className}`}>
                        {badge.label}
                      </span>
                    </td>

                    {/* Created date */}
                    <td className="px-4 py-3.5 text-[#94A3B8] text-xs hidden lg:table-cell">
                      {formatDate(product.createdAt)}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3.5">
                      <div className="flex items-center justify-end gap-2">
                        {/* Edit */}
                        <button
                          id={`action-edit-${product.id}`}
                          onClick={() => router.push(`/products/${product.id}/edit`)}
                          disabled={isActioning}
                          className="text-xs text-[#2563EB] hover:text-[#1D4ED8] font-medium transition-colors disabled:opacity-40"
                          aria-label={`Edit ${product.name}`}
                        >
                          Edit
                        </button>

                        {/* Publish (only for DRAFT) */}
                        {product.status === ProductStatus.DRAFT && (
                          <button
                            id={`action-publish-${product.id}`}
                            onClick={() => void handlePublish(product.id)}
                            disabled={isActioning}
                            className="text-xs text-[#10B981] hover:text-[#059669] font-medium transition-colors disabled:opacity-40"
                            aria-label={`Publish ${product.name}`}
                          >
                            {isActioning ? '…' : 'Publish'}
                          </button>
                        )}

                        {/* Archive (not for ARCHIVED) */}
                        {product.status !== ProductStatus.ARCHIVED && (
                          <button
                            id={`action-archive-${product.id}`}
                            onClick={() => void handleArchive(product.id)}
                            disabled={isActioning}
                            className="text-xs text-[#EF4444] hover:text-[#DC2626] font-medium transition-colors disabled:opacity-40"
                            aria-label={`Archive ${product.name}`}
                          >
                            {isActioning ? '…' : 'Archive'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
