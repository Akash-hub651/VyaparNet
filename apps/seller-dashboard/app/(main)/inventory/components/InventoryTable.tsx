'use client';

import React from 'react';
import Image from 'next/image';
import { InventoryViewModel } from '../../../../lib/api/inventory.client';
import { formatDate } from '../../../../lib/formatters';

interface InventoryTableProps {
  items: InventoryViewModel[];
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleAll: (selectAll: boolean) => void;
  onUpdateStock: (item: InventoryViewModel) => void;
  isLoading?: boolean;
  hasAnyItems: boolean;
}

export function InventoryTable({
  items,
  selectedIds,
  onToggleSelect,
  onToggleAll,
  onUpdateStock,
  isLoading = false,
  hasAnyItems,
}: InventoryTableProps) {
  if (isLoading) {
    return (
      <div className="bg-surface-card rounded-xl shadow-1 overflow-hidden border border-neutral-200" aria-busy="true">
        <div className="p-4 border-b border-neutral-200">
          <div className="h-6 w-32 bg-neutral-200 animate-pulse rounded"></div>
        </div>
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex gap-4 p-4 border-b border-neutral-100 items-center">
            <div className="h-4 w-4 bg-neutral-200 animate-pulse rounded"></div>
            <div className="h-10 w-10 bg-neutral-200 animate-pulse rounded-md"></div>
            <div className="flex-1 space-y-2">
              <div className="h-4 w-1/3 bg-neutral-200 animate-pulse rounded"></div>
              <div className="h-3 w-1/4 bg-neutral-100 animate-pulse rounded"></div>
            </div>
            <div className="h-4 w-24 bg-neutral-200 animate-pulse rounded"></div>
          </div>
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="bg-surface-card rounded-xl shadow-1 p-12 text-center border border-neutral-200">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-neutral-100 text-neutral-400 mb-4">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
          </svg>
        </div>
        {!hasAnyItems ? (
          <>
            <h3 className="text-base font-semibold text-text-primary mb-1">Abhi koi inventory nahi. Products add karein pehle.</h3>
            <a href="/products" className="inline-flex items-center gap-1.5 mt-4 text-sm font-semibold text-brand-600 hover:text-brand-700">
              Products Page Jaiye <span aria-hidden="true">→</span>
            </a>
          </>
        ) : (
          <>
            <h3 className="text-base font-semibold text-text-primary mb-1">Applied filter se koi product nahi mila.</h3>
            <button onClick={() => onToggleAll(false) /* generic reset fallback */} className="inline-flex items-center gap-1.5 mt-4 text-sm font-semibold text-brand-600 hover:text-brand-700">
              Filters hatayein
            </button>
          </>
        )}
      </div>
    );
  }

  const allSelected = items.length > 0 && selectedIds.size === items.length;
  const someSelected = items.length > 0 && selectedIds.size > 0 && selectedIds.size < items.length;

  return (
    <div className="bg-surface-card rounded-xl shadow-1 overflow-hidden border border-neutral-200">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse" role="table">
          <thead>
            <tr className="bg-neutral-50 border-b border-neutral-200">
              <th className="py-3 px-4 w-10">
                <input
                  type="checkbox"
                  className="rounded border-neutral-300 text-brand-600 focus:ring-brand-500 w-4 h-4"
                  checked={allSelected}
                  ref={el => { if (el) el.indeterminate = someSelected; }}
                  onChange={(e) => onToggleAll(e.target.checked)}
                  aria-label="Select all rows"
                />
              </th>
              <th className="py-3 px-4 text-xs font-medium text-text-secondary uppercase tracking-wider">Product</th>
              <th className="py-3 px-4 text-xs font-medium text-text-secondary uppercase tracking-wider">Segment</th>
              <th className="py-3 px-4 text-xs font-medium text-text-secondary uppercase tracking-wider">Current Stock</th>
              <th className="py-3 px-4 text-xs font-medium text-text-secondary uppercase tracking-wider">Low Stock Threshold</th>
              <th className="py-3 px-4 text-xs font-medium text-text-secondary uppercase tracking-wider">Price</th>
              <th className="py-3 px-4 text-xs font-medium text-text-secondary uppercase tracking-wider">Last Updated</th>
              <th className="py-3 px-4 text-xs font-medium text-text-secondary uppercase tracking-wider text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {items.map((item) => {
              const isSelected = selectedIds.has(item.id);
              
              // Determine row tint and status dot based on rules
              const isOutOfStock = item.isOutOfStock;
              const isLowStock = item.isLowStock;
              
              const rowClasses = isOutOfStock 
                ? 'bg-error-50 hover:bg-error-100/80 transition-colors group' 
                : isLowStock 
                  ? 'bg-warning-50 hover:bg-warning-100/80 transition-colors group' 
                  : 'hover:bg-neutral-50 transition-colors group';

              return (
                <tr 
                  key={item.id} 
                  className={`${rowClasses} cursor-pointer`}
                  onClick={() => onUpdateStock(item)}
                >
                  <td className="py-3 px-4 align-top w-10" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      className="rounded border-neutral-300 text-brand-600 focus:ring-brand-500 w-4 h-4 mt-1 cursor-pointer"
                      checked={isSelected}
                      onChange={() => onToggleSelect(item.id)}
                      aria-label={`Select ${item.productName}`}
                    />
                  </td>
                  <td className="py-3 px-4 align-top min-w-[200px]">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded bg-neutral-100 border border-neutral-200 overflow-hidden flex-shrink-0 relative">
                        {item.productImage ? (
                          <Image src={item.productImage} alt={item.productName} fill className="object-cover" sizes="40px" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-neutral-400">
                             <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                          </div>
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-text-primary line-clamp-2">{item.productName}</p>
                        <p className="text-xs text-text-muted mt-0.5 font-mono">{item.productSku}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-4 align-top whitespace-nowrap">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-neutral-100 text-neutral-800 border border-neutral-200">
                      {item.segment.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="py-3 px-4 align-top whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      {isOutOfStock ? (
                         <div className="w-2 h-2 rounded-full bg-error-500" aria-label="Stock status: Out of stock" />
                      ) : isLowStock ? (
                         <div className="w-2 h-2 rounded-full bg-warning-500" aria-label={`Stock status: Low — ${item.quantity} units remaining`} />
                      ) : (
                         <div className="w-2 h-2 rounded-full bg-success-500" aria-label={`Stock status: In stock — ${item.quantity} units`} />
                      )}
                      
                      {isOutOfStock ? (
                         <span className="text-sm font-bold text-error-700">Out of stock</span>
                      ) : (
                         <span className={`text-sm font-semibold ${isLowStock ? 'text-warning-800' : 'text-text-primary'}`}>
                           {item.quantity.toLocaleString('en-IN')} <span className="font-normal text-text-secondary">{item.unit}</span>
                         </span>
                      )}
                    </div>
                  </td>
                  <td className="py-3 px-4 align-top whitespace-nowrap text-sm text-text-secondary">
                    {item.lowStockThreshold > 0 ? (
                      `${item.lowStockThreshold.toLocaleString('en-IN')} ${item.unit}`
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="py-3 px-4 align-top whitespace-nowrap font-mono text-sm text-text-primary">
                    ₹{item.price.toLocaleString('en-IN')}/{item.unit.charAt(0)}
                  </td>
                  <td className="py-3 px-4 align-top whitespace-nowrap text-xs text-text-secondary">
                    {formatDate(item.lastUpdated)}
                  </td>
                  <td className="py-3 px-4 align-top whitespace-nowrap text-right" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => onUpdateStock(item)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-brand-700 bg-brand-50 hover:bg-brand-100 border border-brand-200 rounded-md transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
                    >
                      <span>✏️</span> Stock Update
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
