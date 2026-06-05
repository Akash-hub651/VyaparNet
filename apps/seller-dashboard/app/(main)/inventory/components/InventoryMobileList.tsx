'use client';

import React from 'react';
import Image from 'next/image';
import { InventoryViewModel } from '../../../../lib/api/inventory.client';
import { StatusBadge } from '../../../../components/ui/StatusBadge';
import { Skeleton } from '../../../../components/ui/Skeleton';
import { ChevronRight } from 'lucide-react';

interface InventoryMobileListProps {
  items: InventoryViewModel[];
  isLoading: boolean;
  onUpdateStock: (item: InventoryViewModel) => void;
}

export function InventoryMobileList({ items, isLoading, onUpdateStock }: InventoryMobileListProps) {
  if (isLoading) {
    return (
      <div className="flex flex-col gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="bg-surface-card border border-border-default rounded-lg p-3 h-20 flex gap-3">
            <Skeleton className="w-12 h-12 rounded-md shrink-0" />
            <div className="flex-1 flex flex-col justify-center">
              <Skeleton className="w-2/3 h-4 mb-2" />
              <Skeleton className="w-1/2 h-4" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return null; // Empty state handled by parent if needed
  }

  return (
    <div className="flex flex-col gap-3 pb-24">
      {items.map((item) => {
        return (
          <div 
            key={item.id} 
            onClick={() => onUpdateStock(item)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onUpdateStock(item);
              }
            }}
            className="bg-surface-card rounded-lg border border-border-default p-3 flex items-center gap-3 active:bg-surface-hover transition-colors cursor-pointer min-h-[80px]"
          >
            {/* Thumbnail */}
            <div className="w-12 h-12 rounded bg-neutral-50 border border-neutral-200 overflow-hidden relative shrink-0 flex items-center justify-center">
              {item.productImage ? (
                <Image src={item.productImage} alt={item.productName} fill className="object-cover" sizes="48px" />
              ) : (
                <div className="text-neutral-400">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                </div>
              )}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm text-text-primary truncate">{item.productName}</div>
              <div className="text-xs text-text-muted font-mono truncate">{item.productSku}</div>
            </div>

            {/* Stock Status */}
            <div className="flex flex-col items-end shrink-0 mr-1">
              <div className="flex items-center gap-1.5 mb-1">
                <span className={`w-2 h-2 rounded-full ${item.isOutOfStock ? 'bg-error-500' : item.isLowStock ? 'bg-warning-500' : 'bg-success-500'}`}></span>
                <span className="text-sm font-semibold tabular-nums text-text-primary">{item.quantity}</span>
                <span className="text-xs text-text-secondary">{item.unit}</span>
              </div>
              {item.isOutOfStock && <StatusBadge status="OUT_OF_STOCK" size="sm" />}
              {item.isLowStock && !item.isOutOfStock && <StatusBadge status="LOW_STOCK" size="sm" />}
            </div>

            {/* Chevron */}
            <div className="text-text-muted shrink-0 -mr-1">
              <ChevronRight size={20} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
