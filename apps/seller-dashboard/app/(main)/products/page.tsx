'use client';
/**
 * Screen 04: Products List — apps/seller-dashboard/app/(main)/products/page.tsx
 *
 * Authority: seller_dashboard_screen_system.md
 * Features:
 * - Status Tabs (All, Active, Pending, Draft, Rejected, Archived)
 * - Error/Loading handling
 * - Rejection Alert Strip (INVARIANT-UX-10)
 * - Row actions and bulk actions
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, AlertCircle, Search, Settings2 } from 'lucide-react';
import { ProductStatus } from '@vyaparnet/types';
import { useAuth } from '../../contexts/auth.context';
import { useHeader } from '../../contexts/header.context';
import { useSellerPermissions } from '../../../lib/hooks/useSellerPermissions';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ErrorBanner } from '../../../components/ui/ErrorBanner';
import { SkeletonCard } from '../../../components/ui/Skeleton';
import { Button } from '../../../components/ui/Button';
import { ProductListTable } from './ProductListTable';
import { ProductBulkActions } from './ProductBulkActions';
import { ProductFilterDrawer } from './ProductFilterDrawer';
import { useColumnCustomization, ColumnDef } from '../../../components/hooks/useColumnCustomization';
import { ColumnCustomizer } from '../../../components/ui/ColumnCustomizer';

const PRODUCT_COLUMNS: ColumnDef[] = [
  { id: 'product', label: 'Product', isMandatory: true },
  { id: 'segment', label: 'Segment' },
  { id: 'price', label: 'Price' },
  { id: 'stock', label: 'Stock' },
  { id: 'status', label: 'Status' },
  { id: 'actions', label: 'Actions', isMandatory: true },
];

import {
  getSellerProducts,
  type ProductResponse,
} from '../../../lib/api/products.client';

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

interface Tab {
  label: string;
  status: ProductStatus | undefined;
  id: string;
}

const TABS: Tab[] = [
  { label: 'All', status: undefined, id: 'tab-all' },
  { label: 'Active', status: ProductStatus.ACTIVE, id: 'tab-active' },
  { label: 'Pending Review', status: ProductStatus.PENDING_APPROVAL, id: 'tab-pending' },
  { label: 'Draft', status: ProductStatus.DRAFT, id: 'tab-draft' },
  { label: 'Rejected', status: ProductStatus.REJECTED, id: 'tab-rejected' },
  { label: 'Archived', status: ProductStatus.ARCHIVED, id: 'tab-archived' },
];

export default function ProductsPage(): React.JSX.Element {
  const { accessToken } = useAuth();
  const { setTitle } = useHeader();
  const permissions = useSellerPermissions();
  const router = useRouter();

  // State
  const [activeTab, setActiveTab] = useState<Tab>(TABS[0]!);
  const [products, setProducts] = useState<ProductResponse[]>([]);
  const [totalProducts, setTotalProducts] = useState(0);
  const [rejectedCount, setRejectedCount] = useState(0);
  
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());
  const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const columnCust = useColumnCustomization("products", PRODUCT_COLUMNS);

  // ─────────────────────────────────────────────────────────────
  // Initialization & Fetching
  // ─────────────────────────────────────────────────────────────

  useEffect(() => {
    setTitle('Products');
  }, [setTitle]);

  const loadProducts = useCallback(async (isTabSwitch = false) => {
    if (!accessToken) return;
    
    if (isTabSwitch) {
      setIsLoading(true);
    }
    
    // Using parallel fetch for standard load and to get rejected count separately if needed.
    // However, rejected count usually comes from dashboard KPIs.
    // For now, we will fetch the list and if we are on 'All', count rejected client-side
    // or assume API provides it (we will do a quick separate fetch if rejectedCount is unknown).
    
    try {
      const res = await getSellerProducts(
        { 
          status: activeTab.status, 
          limit: 20,
          query: searchQuery || undefined
        },
        accessToken
      );
      
      if (!res.success) {
        setError(res.error);
        setProducts([]);
        setTotalProducts(0);
      } else {
        setProducts(res.data.data);
        setTotalProducts(res.data.total);
        setError(null);
        
        // Count rejected if we are on ALL tab
        if (!activeTab.status) {
          const rejected = res.data.data.filter(p => p.status === ProductStatus.REJECTED).length;
          setRejectedCount(rejected);
        }
      }
    } catch {
      setError('Failed to fetch products');
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, activeTab, searchQuery]);

  useEffect(() => {
    void Promise.resolve().then(() => {
      loadProducts(true);
      // Reset selection when tab changes
      setSelectedProductIds(new Set());
    });
  }, [loadProducts, activeTab]);



  // ─────────────────────────────────────────────────────────────
  // Action Handlers
  // ─────────────────────────────────────────────────────────────

  const handleSelectionChange = (id: string, checked: boolean) => {
    const newSet = new Set(selectedProductIds);
    if (checked) newSet.add(id);
    else newSet.delete(id);
    setSelectedProductIds(newSet);
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedProductIds(new Set(products.map(p => p.id)));
    } else {
      setSelectedProductIds(new Set());
    }
  };

  // ─────────────────────────────────────────────────────────────
  // Render Helpers
  // ─────────────────────────────────────────────────────────────

  const renderEmptyState = () => {
    if (activeTab.status === ProductStatus.REJECTED && rejectedCount === 0) {
      return (
        <EmptyState
          preset="products_rejected_clear"
        />
      );
    }
    
    if (searchQuery) {
      return (
        <EmptyState
          preset="products_no_match"
          title={`'${searchQuery}' se koi product nahi mila`}
          onSecondary={() => setSearchQuery('')}
        />
      );
    }

    return (
      <EmptyState
        preset="products_zero"
        ctaLabel={!permissions.isStaff ? "+ Pehla Product Add Karein" : undefined}
        onCta={!permissions.isStaff ? () => router.push('/products/new') : undefined}
      />
    );
  };

  return (
    <div className="space-y-6">
      {/* ROW A: PAGE HEADER */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-text-primary">Products</h1>
          <span className="px-2.5 py-1 text-xs font-medium bg-surface-hover text-text-secondary rounded-full">
            {totalProducts} products
          </span>
        </div>
        {!permissions.isStaff && (
          <Button
            variant="primary"
            icon={<Plus size={16} />}
            onClick={() => router.push('/products/new')}
            className="min-h-[44px]"
          >
            Product Add Karein
          </Button>
        )}
      </div>

      {/* ROW B: REJECTION ALERT STRIP */}
      {rejectedCount > 0 && (
        <div 
          className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-error-50 border-l-4 border-error-500 p-4 rounded-r-md"
          role="alert"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-error-600" />
            <span className="text-sm font-medium text-error-900">
              ❌ {rejectedCount} products reject ho gaye — buyers inhe nahi dekh sakte.
            </span>
          </div>
          <button 
            onClick={() => setActiveTab(TABS.find(t => t.status === ProductStatus.REJECTED)!)}
            className="text-sm font-semibold text-error-700 hover:text-error-800 focus-visible:outline-none min-h-[44px] sm:min-h-0"
          >
            Rejected Products Dekho →
          </button>
        </div>
      )}

      {/* ROW C: TAB FILTER BAR */}
      <div className="flex overflow-x-auto border-b border-border-default no-scrollbar" role="tablist">
        {TABS.map((tab) => {
          const isSelected = activeTab.id === tab.id;
          const isRejectedTab = tab.status === ProductStatus.REJECTED;
          
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isSelected}
              onClick={() => setActiveTab(tab)}
              className={`whitespace-nowrap px-4 py-3 text-sm font-medium border-b-2 transition-colors min-h-[44px] ${
                isSelected 
                  ? 'border-brand-600 text-brand-600' 
                  : 'border-transparent text-text-secondary hover:text-text-primary'
              } ${isRejectedTab && rejectedCount > 0 ? 'text-error-600' : ''}`}
            >
              <div className="flex items-center gap-2">
                {tab.label}
                {isRejectedTab && rejectedCount > 0 && (
                  <span className="w-2 h-2 rounded-full bg-error-500" aria-label={`Rejected products: ${rejectedCount}`} />
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* ROW D: SECONDARY BAR */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <label htmlFor="products-search" className="sr-only">
            Product naam ya SKU se search karein
          </label>
          <input
            id="products-search"
            type="text"
            placeholder="Product name ya SKU..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm border border-border-default rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500 min-h-[44px] bg-surface-default"
          />
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Button
            variant="ghost"
            icon={<Settings2 size={16} />}
            onClick={() => setIsFilterDrawerOpen(true)}
            className="w-full sm:w-auto min-h-[44px]"
          >
            Filter
          </Button>
          <ColumnCustomizer
            columns={PRODUCT_COLUMNS}
            visibleColumnIds={columnCust.visibleColumnIds}
            onToggle={columnCust.toggleColumn}
            onReset={columnCust.resetColumns}
          />
        </div>
      </div>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      {/* ROW E: TABLE / CONTENT */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <SkeletonCard key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : products.length === 0 ? (
        renderEmptyState()
      ) : (
        <ProductListTable
          products={products}
          selectedIds={selectedProductIds}
          onSelectionChange={handleSelectionChange}
          onSelectAll={handleSelectAll}
          onRefresh={() => void loadProducts()}
          isStaff={permissions.isStaff}
          visibleColumnIds={columnCust.visibleColumnIds}
        />
      )}

      {/* BULK ACTIONS BAR */}
      {selectedProductIds.size > 0 && (
        <ProductBulkActions
          selectedCount={selectedProductIds.size}
          products={products.filter(p => selectedProductIds.has(p.id))}
          onClearSelection={() => setSelectedProductIds(new Set())}
          onSuccess={() => {
            setSelectedProductIds(new Set());
            void loadProducts();
          }}
        />
      )}

      {/* FILTER DRAWER */}
      <ProductFilterDrawer
        isOpen={isFilterDrawerOpen}
        onClose={() => setIsFilterDrawerOpen(false)}
      />
    </div>
  );
}
