'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useHeader } from '../../contexts/header.context';
import { useSellerPermissions } from '../../../lib/hooks/useSellerPermissions';
import { ErrorBanner } from '../../../components/ui/ErrorBanner';
import { getSellerInventory, InventoryViewModel, adaptInventoryToViewModel } from '../../../lib/api/inventory.client';
import { useAuth } from '../../contexts/auth.context';
import { InventoryTable } from './components/InventoryTable';
import { InventoryMobileList } from './components/InventoryMobileList';
import { PullToRefresh } from '../../../components/ui/PullToRefresh';
import { StockUpdateModal } from './components/StockUpdateModal';
import { BulkStockUpdateModal } from './components/BulkStockUpdateModal';
import { useColumnCustomization, ColumnDef } from '../../../components/hooks/useColumnCustomization';
import { ColumnCustomizer } from '../../../components/ui/ColumnCustomizer';

const INVENTORY_COLUMNS: ColumnDef[] = [
  { id: 'product', label: 'Product', isMandatory: true },
  { id: 'segment', label: 'Segment' },
  { id: 'stock', label: 'Current Stock' },
  { id: 'low_stock', label: 'Low Stock Threshold' },
  { id: 'price', label: 'Price' },
  { id: 'last_updated', label: 'Last Updated' },
  { id: 'actions', label: 'Actions', isMandatory: true },
];

type FilterStatus = 'ALL' | 'LOW_STOCK' | 'OUT_OF_STOCK';

export default function SellerInventoryPage() {
  const { setTitle } = useHeader();
  const { accessToken } = useAuth();
  const { kycStatus, isSuspended } = useSellerPermissions();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<InventoryViewModel[]>([]);
  
  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('ALL');

  // Modals
  const [updateModalProduct, setUpdateModalProduct] = useState<InventoryViewModel | null>(null);
  const [showBulkModal, setShowBulkModal] = useState(false);

  const columnCust = useColumnCustomization("inventory", INVENTORY_COLUMNS);

  useEffect(() => {
    setTitle('Inventory');
  }, [setTitle]);

  const loadData = async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const res = await getSellerInventory({}, accessToken);
      if (res.error) {
        setError(res.error.message || 'Inventory load nahi ho payi.');
      } else if (res.data) {
        setItems(res.data.data.map(adaptInventoryToViewModel));
      }
    } catch {
      setError('Network error. Inventory load nahi ho payi.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (kycStatus === 'VERIFIED') {
      // eslint-disable-next-line
      void loadData();
    } else {
      setLoading(false); // If not verified, we might show a block or just empty depending on rules
    }
    // eslint-disable-next-line
  }, [accessToken, kycStatus]);

  // Derived state (Client-side filtering for simplicity since API list might just return everything if limit is high)
  const filteredItems = useMemo(() => {
    return items.filter(item => {
      // Status filter
      if (filterStatus === 'OUT_OF_STOCK' && !item.isOutOfStock) return false;
      if (filterStatus === 'LOW_STOCK' && !item.isLowStock && !item.isOutOfStock) return false; // Usually low stock might include out of stock or be strictly low. Let's say strictly low stock:
      if (filterStatus === 'LOW_STOCK' && (!item.isLowStock || item.isOutOfStock)) return false; 
      
      // Search
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return item.productName.toLowerCase().includes(q) || item.productSku.toLowerCase().includes(q);
      }
      return true;
    }).sort((a, b) => {
      // Default Sort: Out of stock first, then low stock, then alpha
      if (a.isOutOfStock && !b.isOutOfStock) return -1;
      if (!a.isOutOfStock && b.isOutOfStock) return 1;
      if (a.isLowStock && !b.isLowStock) return -1;
      if (!a.isLowStock && b.isLowStock) return 1;
      return a.productName.localeCompare(b.productName);
    });
  }, [items, filterStatus, searchQuery]);

  // KPIs
  const totalItems = items.length;
  const lowStockCount = items.filter(i => i.isLowStock && !i.isOutOfStock).length;
  const outOfStockCount = items.filter(i => i.isOutOfStock).length;

  const handleToggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleToggleAll = (selectAll: boolean) => {
    if (selectAll) setSelectedIds(new Set(filteredItems.map(i => i.id)));
    else setSelectedIds(new Set());
  };

  const handleUpdateSuccess = (updatedItem: InventoryViewModel) => {
    setItems(prev => prev.map(i => i.id === updatedItem.id ? updatedItem : i));
  };

  const handleBulkUpdateSuccess = (updatedItems: InventoryViewModel[]) => {
    setItems(prev => prev.map(item => {
      const matched = updatedItems.find(u => u.id === item.id);
      return matched || item;
    }));
    setSelectedIds(new Set());
  };

  if (kycStatus !== 'VERIFIED') {
    return (
      <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
         <ErrorBanner message="Inventory access ke liye KYC complete karna zaroori hai." />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
      {isSuspended && (
        <div className="mb-6">
          <ErrorBanner message="Aapka account suspended hai. App sirf read-only mode mein inventory dekh sakte hain." />
        </div>
      )}

      {error && (
        <div className="mb-6">
          <ErrorBanner message={error} />
          <button onClick={() => void loadData()} className="mt-2 text-sm text-brand-600 hover:text-brand-700">↻ Dobara Try Karein</button>
        </div>
      )}

      {/* ROW A: PAGE HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-text-primary">Inventory</h1>
          <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${lowStockCount > 0 ? 'bg-warning-100 text-warning-700' : 'bg-neutral-100 text-neutral-600'}`}>
            {lowStockCount > 0 ? `${lowStockCount} low stock` : `${totalItems} products`}
          </span>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <button
            onClick={() => {}}
            disabled={isSuspended}
            className="flex-1 sm:flex-none px-4 py-2 border border-neutral-300 text-neutral-700 rounded-lg text-sm font-semibold hover:bg-neutral-50 transition-colors disabled:opacity-50"
          >
            ↓ Export
          </button>
          <button
            onClick={() => setShowBulkModal(true)}
            disabled={isSuspended || selectedIds.size === 0}
            className="flex-1 sm:flex-none px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-semibold hover:bg-brand-700 transition-colors disabled:opacity-50 disabled:bg-brand-400"
          >
            <span className="hidden sm:inline">+ Stock Update {selectedIds.size > 0 ? `(${selectedIds.size})` : ''}</span>
            <span className="sm:hidden">+ Update</span>
          </button>
        </div>
      </div>

      {/* ROW B: KPI STRIP */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-surface-card border border-neutral-200 rounded-xl p-5 shadow-1" role="region" aria-label="Total SKUs">
          <p className="text-sm font-medium text-text-secondary mb-1">Total SKUs</p>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-info-600">{totalItems}</span>
            <span className="text-xs text-text-secondary">products</span>
          </div>
        </div>
        <div className="bg-surface-card border border-warning-200 rounded-xl p-5 shadow-1 relative overflow-hidden" role="region" aria-label="Low Stock">
          <div className="absolute top-0 left-0 w-1 h-full bg-warning-500"></div>
          <p className="text-sm font-medium text-text-secondary mb-1">Low Stock</p>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-warning-700">{lowStockCount}</span>
            <span className="text-xs text-text-secondary">products</span>
          </div>
        </div>
        <div className="bg-surface-card border border-error-200 rounded-xl p-5 shadow-1 relative overflow-hidden" role="region" aria-label="Out of Stock">
          <div className="absolute top-0 left-0 w-1 h-full bg-error-500"></div>
          <p className="text-sm font-medium text-text-secondary mb-1">Out of Stock</p>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-error-700">{outOfStockCount}</span>
            <span className="text-xs text-text-secondary">products</span>
          </div>
        </div>
      </div>

      {/* ROW C: SECONDARY BAR */}
      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <div className="flex flex-col sm:flex-row gap-3 flex-1">
          <div className="relative flex-1 max-w-sm">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <span aria-hidden="true">🔍</span>
            </div>
            <label htmlFor="inventory-search" className="sr-only">
              Product naam ya SKU se search karein
            </label>
            <input
              id="inventory-search"
              type="text"
              placeholder="Product naam ya SKU..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="block w-full pl-10 pr-3 py-2 border border-neutral-300 rounded-lg text-sm bg-surface-card focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div className="flex bg-neutral-100 p-1 rounded-lg overflow-x-auto no-scrollbar whitespace-nowrap w-full sm:w-auto">
            {(['ALL', 'LOW_STOCK', 'OUT_OF_STOCK'] as FilterStatus[]).map(status => (
              <button
                key={status}
                onClick={() => setFilterStatus(status)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  filterStatus === status 
                    ? 'bg-white shadow-1 text-text-primary' 
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                {status === 'ALL' ? 'All' : status === 'LOW_STOCK' ? 'Low Stock' : 'Out of Stock'}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* LOW-A3 FIX: Sort/Filter buttons have aria-labels.
               Sprint 8 scope: these are visual placeholders; wiring is Sprint 9. */}
          <button
            aria-label="Inventory sort karein"
            title="Sort inventory"
            className="px-3 py-2 text-sm font-medium text-text-secondary border border-neutral-200 rounded-lg bg-surface-card hover:bg-neutral-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            Sort ▾
          </button>
          <button
            aria-label="Inventory filter karein"
            title="Filter inventory"
            className="px-3 py-2 text-sm font-medium text-text-secondary border border-neutral-200 rounded-lg bg-surface-card hover:bg-neutral-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            Filter ≡
          </button>
          <div className="hidden sm:block">
            <ColumnCustomizer
              columns={INVENTORY_COLUMNS}
              visibleColumnIds={columnCust.visibleColumnIds}
              onToggle={columnCust.toggleColumn}
              onReset={columnCust.resetColumns}
            />
          </div>
        </div>
      </div>

      {/* ROW D: INVENTORY TABLE / LIST */}
      <div className="hidden md:block">
        <InventoryTable
          items={filteredItems}
          selectedIds={selectedIds}
          onToggleSelect={handleToggleSelect}
          onToggleAll={handleToggleAll}
          onUpdateStock={setUpdateModalProduct}
          isLoading={loading}
          hasAnyItems={items.length > 0}
          visibleColumnIds={columnCust.visibleColumnIds}
        />
      </div>
      <div className="md:hidden">
        <PullToRefresh onRefresh={async () => { await loadData(); }}>
          <InventoryMobileList
            items={filteredItems}
            isLoading={loading}
            onUpdateStock={setUpdateModalProduct}
          />
        </PullToRefresh>
      </div>

      {/* MODALS */}
      <StockUpdateModal
        isOpen={!!updateModalProduct}
        onClose={() => setUpdateModalProduct(null)}
        product={updateModalProduct}
        onSuccess={handleUpdateSuccess}
      />

      <BulkStockUpdateModal
        isOpen={showBulkModal}
        onClose={() => setShowBulkModal(false)}
        selectedItems={items.filter(i => selectedIds.has(i.id))}
        onSuccess={handleBulkUpdateSuccess}
      />
    </div>
  );
}
