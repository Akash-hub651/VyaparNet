'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/auth.context';
import {
  getSellerInventory,
  updateSellerStock,
  getMovementHistory,
  type InventoryResponse,
  type MovementResponse,
} from '../../../lib/api/inventory.client';


function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function SellerInventoryPage(): React.JSX.Element {
  const { accessToken } = useAuth();
  const [inventories, setInventories] = useState<InventoryResponse[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [lowStockOnly, setLowStockOnly] = useState(false);

  // Pagination / Cursor State for Inventory list
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  // Edit Modal State
  const [editingItem, setEditingItem] = useState<InventoryResponse | null>(null);
  const [editQty, setEditQty] = useState<number>(0);
  const [editThreshold, setEditThreshold] = useState<number>(10);
  const [editReason, setEditReason] = useState<string>('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Movement History Modal State
  const [viewingHistoryProduct, setViewingHistoryProduct] = useState<InventoryResponse | null>(null);
  const [movements, setMovements] = useState<MovementResponse[]>([]);
  const [movementsNextCursor, setMovementsNextCursor] = useState<string | null>(null);
  const [isMovementsLoading, setIsMovementsLoading] = useState(false);

  // Load Inventory list
  const loadInventory = useCallback(async (reset = true, cursor?: string) => {
    if (!accessToken) return;
    setIsLoading(true);
    setError(null);

    const res = await getSellerInventory(
      {
        limit: 20,
        cursor: cursor,
        lowStockOnly: lowStockOnly || undefined,
      },
      accessToken
    );

    if (res.error) {
      setError(res.error.message);
    } else {
      if (reset) {
        setInventories(res.data?.data ?? []);
      } else {
        setInventories((prev) => [...prev, ...(res.data?.data ?? [])]);
      }
      setNextCursor(res.data?.nextCursor ?? null);
    }
    setIsLoading(false);
  }, [accessToken, lowStockOnly]);

  useEffect(() => {
    void loadInventory(true);
  }, [loadInventory]);

  // Load movements history for a specific inventory/product
  const loadMovements = async (productId: string, reset = true, cursor?: string) => {
    if (!accessToken) return;
    setIsMovementsLoading(true);
    const res = await getMovementHistory(productId, { limit: 10, cursor }, accessToken);
    if (!res.error) {
      if (reset) {
        setMovements(res.data?.data ?? []);
      } else {
        setMovements((prev) => [...prev, ...(res.data?.data ?? [])]);
      }
      setMovementsNextCursor(res.data?.nextCursor ?? null);
    }
    setIsMovementsLoading(false);
  };

  // Open inline edit modal
  const openEditModal = (item: InventoryResponse) => {
    setEditingItem(item);
    setEditQty(item.quantity);
    setEditThreshold(item.lowStockThreshold);
    setEditReason('');
    setModalError(null);
  };

  // Save inline edit with optimistic update support
  const handleSaveStock = async () => {
    if (!editingItem || !accessToken) return;
    if (!editReason.trim()) {
      setModalError('अपडेट का कारण लिखना अनिवार्य है (Reason is mandatory)');
      return;
    }

    setIsUpdating(true);
    setModalError(null);

    const originalInventories = [...inventories];
    const prevItem = { ...editingItem };

    // Optimistic Update
    setInventories((prev) =>
      prev.map((item) =>
        item.productId === prevItem.productId
          ? {
              ...item,
              quantity: editQty,
              lowStockThreshold: editThreshold,
              isLowStock: editQty <= editThreshold,
              updatedAt: new Date().toISOString(),
            }
          : item
      )
    );

    const res = await updateSellerStock(
      editingItem.productId,
      {
        quantity: editQty,
        lowStockThreshold: editThreshold,
        reason: editReason,
      },
      accessToken
    );

    if (res.error) {
      // Rollback
      setInventories(originalInventories);
      setModalError(res.error.message);
    } else {
      // Replace with actual updated payload from API
      setInventories((prev) =>
        prev.map((item) => (item.productId === prevItem.productId ? res.data! : item))
      );
      setEditingItem(null);
    }
    setIsUpdating(false);
  };

  // Check if safety warning should be rendered
  const showSafetyWarning = editingItem && editQty < editingItem.reservedQty;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#1E293B]">Inventory Management</h1>
          <p className="text-sm text-[#64748B] mt-1">
            Real-time B2B stock tracking, thresholds, and append-only audits.
          </p>
        </div>

        {/* Filter Toggle */}
        <div className="flex items-center gap-2">
          <label className="text-sm font-semibold text-[#475569] cursor-pointer" htmlFor="low-stock-toggle">
            Low Stock Only
          </label>
          <button
            id="low-stock-toggle"
            role="switch"
            aria-checked={lowStockOnly}
            onClick={() => setLowStockOnly(!lowStockOnly)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
              lowStockOnly ? 'bg-[#EF4444]' : 'bg-[#CBD5E1]'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                lowStockOnly ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Global Error Banner */}
      {error && (
        <div className="bg-[#FEE2E2] border border-[#FECACA] rounded-lg px-4 py-3 text-sm text-[#991B1B] mb-4" role="alert">
          {error}
        </div>
      )}

      {/* Loading Skeleton */}
      {isLoading && inventories.length === 0 && (
        <div className="flex items-center justify-center py-20 text-[#64748B]">
          <svg className="animate-spin w-6 h-6 mr-2" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" opacity="0.25" />
            <path d="M22 12a10 10 0 01-10 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          Loading Inventory…
        </div>
      )}

      {/* Empty State */}
      {!isLoading && inventories.length === 0 && (
        <div className="text-center py-20 bg-white rounded-xl border border-[#E2E8F0]">
          <div className="text-5xl mb-4">📦</div>
          <h2 className="text-lg font-semibold text-[#1E293B] mb-2">कोई स्टॉक रिकॉर्ड नहीं मिला</h2>
          <p className="text-sm text-[#64748B]">
            Ensure products are published. Published products automatically receive stock initialized to 0.
          </p>
        </div>
      )}

      {/* Inventory Table */}
      {inventories.length > 0 && (
        <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left" aria-label="Seller stock list">
              <thead>
                <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC]">
                  <th className="px-4 py-3.5 text-xs font-semibold text-[#64748B] uppercase tracking-wide w-12">#</th>
                  <th className="px-4 py-3.5 text-xs font-semibold text-[#64748B] uppercase tracking-wide">Product</th>
                  <th className="px-4 py-3.5 text-xs font-semibold text-[#64748B] uppercase tracking-wide">Segment</th>
                  <th className="px-4 py-3.5 text-xs font-semibold text-[#64748B] uppercase tracking-wide text-right">Reserved</th>
                  <th className="px-4 py-3.5 text-xs font-semibold text-[#64748B] uppercase tracking-wide text-right">Available Qty</th>
                  <th className="px-4 py-3.5 text-xs font-semibold text-[#64748B] uppercase tracking-wide text-right">Threshold</th>
                  <th className="px-4 py-3.5 text-xs font-semibold text-[#64748B] uppercase tracking-wide text-center">Status</th>
                  <th className="px-4 py-3.5 text-xs font-semibold text-[#64748B] uppercase tracking-wide text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9]">
                {inventories.map((item, index) => {
                  // Badges:
                  // Red: isLowStock=true
                  // Amber: quantity < 10 && !isLowStock
                  let statusBadge = (
                    <span className="inline-flex text-xs font-semibold px-2.5 py-0.5 rounded-full bg-[#D1FAE5] text-[#065F46] border border-[#A7F3D0]">
                      Healthy
                    </span>
                  );

                  if (item.isLowStock) {
                    statusBadge = (
                      <span className="inline-flex text-xs font-semibold px-2.5 py-0.5 rounded-full bg-[#FEE2E2] text-[#991B1B] border border-[#FCA5A5]">
                        Low Stock
                      </span>
                    );
                  } else if (item.quantity < 10) {
                    statusBadge = (
                      <span className="inline-flex text-xs font-semibold px-2.5 py-0.5 rounded-full bg-[#FEF3C7] text-[#92400E] border border-[#FCD34D]">
                        Warning
                      </span>
                    );
                  }

                  return (
                    <tr
                      key={item.id}
                      id={`inventory-row-${item.productId}`}
                      className="hover:bg-[#F8FAFC] transition-colors"
                    >
                      <td className="px-4 py-4 text-[#94A3B8] text-xs">{index + 1}</td>
                      <td className="px-4 py-4">
                        <div className="font-semibold text-[#1E293B] line-clamp-1">{item.productName ?? 'Unknown Product'}</div>
                        <div className="text-xs text-[#94A3B8] mt-0.5 font-mono">{item.productId}</div>
                      </td>
                      <td className="px-4 py-4">
                        <span className="text-xs bg-[#EFF6FF] text-[#2563EB] border border-[#BFDBFE] px-2 py-0.5 rounded font-medium">
                          {item.segment}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-right font-medium text-[#64748B]">
                        {item.reservedQty}
                      </td>
                      <td className="px-4 py-4 text-right font-bold text-[#1E293B]">
                        {item.quantity}
                      </td>
                      <td className="px-4 py-4 text-right text-[#475569]">
                        {item.lowStockThreshold}
                      </td>
                      <td className="px-4 py-4 text-center">
                        {statusBadge}
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center justify-end gap-3">
                          <button
                            id={`btn-edit-stock-${item.productId}`}
                            onClick={() => openEditModal(item)}
                            className="text-xs text-[#2563EB] hover:text-[#1D4ED8] font-semibold transition-colors"
                          >
                            Update Stock
                          </button>
                          <button
                            id={`btn-view-history-${item.productId}`}
                            onClick={() => {
                              setViewingHistoryProduct(item);
                              void loadMovements(item.productId, true);
                            }}
                            className="text-xs text-[#64748B] hover:text-[#1E293B] font-semibold transition-colors"
                          >
                            History
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Load More Pagination */}
          {nextCursor && (
            <div className="border-t border-[#E2E8F0] p-4 text-center">
              <button
                onClick={() => void loadInventory(false, nextCursor)}
                disabled={isLoading}
                className="inline-flex items-center text-xs font-semibold text-[#2563EB] hover:text-[#1D4ED8] bg-white border border-[#CBD5E1] px-4 py-2 rounded-lg shadow-sm hover:bg-[#F8FAFC] transition-all disabled:opacity-50"
              >
                {isLoading ? 'Loading…' : 'Load More Products'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── EDIT STOCK MODAL ────────────────────────────────────── */}
      {editingItem && (
        <div className="fixed inset-0 z-50 bg-[#0F172A]/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl border border-[#E2E8F0] p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-[#1E293B]">Update Stock Quantity</h2>
              <button
                onClick={() => setEditingItem(null)}
                className="text-[#94A3B8] hover:text-[#475569] transition-colors"
                aria-label="Close modal"
              >
                ✕
              </button>
            </div>

            {/* Product description header */}
            <div className="bg-[#F8FAFC] p-3 rounded-lg border border-[#E2E8F0]">
              <div className="text-xs text-[#64748B] font-medium">Product</div>
              <div className="text-sm font-bold text-[#1E293B] mt-0.5">{editingItem.productName}</div>
              <div className="flex gap-4 mt-2 pt-2 border-t border-[#E2E8F0]/60 text-xs">
                <div>
                  <span className="text-[#64748B] block">Current Stock</span>
                  <span className="font-bold text-[#1E293B]">{editingItem.quantity}</span>
                </div>
                <div>
                  <span className="text-[#64748B] block">Reserved Qty</span>
                  <span className="font-bold text-[#EF4444]">{editingItem.reservedQty}</span>
                </div>
              </div>
            </div>

            {/* Form Fields */}
            <div className="space-y-3.5">
              {/* Safety Warning for Reserved stock breach */}
              {showSafetyWarning && (
                <div className="bg-[#FFFBEB] border border-[#FDE68A] text-[#92400E] p-3 rounded-lg text-xs font-semibold leading-relaxed flex gap-2">
                  <span>⚠️</span>
                  <span>
                    Warning: active reservations exceed new stock — active reservations may fail to consume.
                  </span>
                </div>
              )}

              {/* Quantity Input */}
              <div>
                <label className="block text-xs font-bold text-[#475569] mb-1.5" htmlFor="input-new-quantity">
                  NEW QUANTITY
                </label>
                <input
                  id="input-new-quantity"
                  type="number"
                  min="0"
                  value={editQty}
                  onChange={(e) => setEditQty(Math.max(0, parseInt(e.target.value, 10) || 0))}
                  className="w-full border border-[#CBD5E1] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:border-transparent"
                />
              </div>

              {/* Threshold Input */}
              <div>
                <label className="block text-xs font-bold text-[#475569] mb-1.5" htmlFor="input-threshold">
                  LOW STOCK THRESHOLD
                </label>
                <input
                  id="input-threshold"
                  type="number"
                  min="0"
                  value={editThreshold}
                  onChange={(e) => setEditThreshold(Math.max(0, parseInt(e.target.value, 10) || 0))}
                  className="w-full border border-[#CBD5E1] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:border-transparent"
                />
              </div>

              {/* Reason Input */}
              <div>
                <label className="block text-xs font-bold text-[#475569] mb-1.5" htmlFor="input-reason">
                  REASON FOR UPDATE (RECONCILIATION / RE-STOCK)*
                </label>
                <textarea
                  id="input-reason"
                  rows={2}
                  value={editReason}
                  onChange={(e) => setEditReason(e.target.value)}
                  placeholder="e.g. Received shipment from warehouse / Damage adjustment"
                  className="w-full border border-[#CBD5E1] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:border-transparent resize-none"
                />
              </div>
            </div>

            {/* Modal Error */}
            {modalError && (
              <div className="bg-[#FEE2E2] border border-[#FECACA] rounded-lg px-3 py-2 text-xs text-[#991B1B]">
                {modalError}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setEditingItem(null)}
                disabled={isUpdating}
                className="flex-1 border border-[#CBD5E1] hover:bg-[#F8FAFC] text-[#475569] font-semibold py-2.5 rounded-lg text-sm transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                id="btn-confirm-update-stock"
                onClick={handleSaveStock}
                disabled={isUpdating}
                className="flex-1 bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-semibold py-2.5 rounded-lg text-sm transition-colors disabled:opacity-50 flex items-center justify-center"
              >
                {isUpdating ? 'Updating…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MOVEMENT HISTORY MODAL ──────────────────────────────── */}
      {viewingHistoryProduct && (
        <div className="fixed inset-0 z-50 bg-[#0F172A]/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-xl rounded-2xl border border-[#E2E8F0] p-6 shadow-2xl space-y-4 max-h-[85vh] flex flex-col animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between flex-shrink-0">
              <div>
                <h2 className="text-lg font-bold text-[#1E293B]">Stock Movement History</h2>
                <p className="text-xs text-[#64748B] mt-0.5">
                  Append-only stock updates audit trail for: <span className="font-semibold text-[#1E293B]">{viewingHistoryProduct.productName}</span>
                </p>
              </div>
              <button
                onClick={() => setViewingHistoryProduct(null)}
                className="text-[#94A3B8] hover:text-[#475569] transition-colors"
                aria-label="Close modal"
              >
                ✕
              </button>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto min-h-[250px] pr-2">
              {isMovementsLoading && movements.length === 0 ? (
                <div className="flex items-center justify-center py-20 text-[#64748B]">
                  <svg className="animate-spin w-5 h-5 mr-2" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" opacity="0.25" />
                    <path d="M22 12a10 10 0 01-10 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                  Loading movements history…
                </div>
              ) : movements.length === 0 ? (
                <div className="text-center py-20 text-[#64748B]">
                  No movement history recorded yet for this product.
                </div>
              ) : (
                <div className="space-y-3">
                  {movements.map((mv) => {
                    const isInbound = ['INBOUND', 'RESTOCK'].includes(mv.type) || (mv.type === 'ADJUSTMENT' && mv.quantity > 0);
                    return (
                      <div
                        key={mv.id}
                        className="border border-[#E2E8F0] hover:border-[#CBD5E1] p-3 rounded-lg bg-[#F8FAFC] transition-colors"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <span
                              className={`inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                isInbound
                                  ? 'bg-[#E8F5E9] text-[#2E7D32] border border-[#C8E6C9]'
                                  : 'bg-[#FFEBEE] text-[#C62828] border border-[#FFCDD2]'
                              }`}
                            >
                              {mv.type}
                            </span>
                            <div className="text-xs text-[#64748B] mt-1">
                              By: <span className="font-semibold text-[#475569]">{mv.createdBy || 'System'}</span>
                            </div>
                            {mv.reason && (
                              <p className="text-xs font-medium text-[#1E293B] mt-1.5 italic bg-white border border-[#E2E8F0]/70 rounded p-1.5">
                                "{mv.reason}"
                              </p>
                            )}
                          </div>
                          <div className="text-right">
                            <span
                              className={`text-sm font-bold ${
                                isInbound ? 'text-[#2E7D32]' : 'text-[#C62828]'
                              }`}
                            >
                              {isInbound ? '+' : '-'}
                              {Math.abs(mv.quantity)}
                            </span>
                            <div className="text-[10px] text-[#94A3B8] mt-1">
                              {formatDate(mv.createdAt)}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {/* Movements Pagination Load More */}
                  {movementsNextCursor && (
                    <div className="pt-2 text-center">
                      <button
                        onClick={() => void loadMovements(viewingHistoryProduct.productId, false, movementsNextCursor)}
                        disabled={isMovementsLoading}
                        className="text-xs font-semibold text-[#2563EB] hover:text-[#1D4ED8] bg-white border border-[#CBD5E1] px-3 py-1.5 rounded-lg shadow-sm hover:bg-[#F8FAFC] disabled:opacity-50 transition-all"
                      >
                        {isMovementsLoading ? 'Loading…' : 'Load Older Movements'}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="border-t border-[#E2E8F0] pt-4 flex-shrink-0">
              <button
                onClick={() => setViewingHistoryProduct(null)}
                className="w-full bg-[#F1F5F9] hover:bg-[#E2E8F0] text-[#334155] font-semibold py-2.5 rounded-lg text-sm transition-colors text-center"
              >
                Close Audit Log
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
