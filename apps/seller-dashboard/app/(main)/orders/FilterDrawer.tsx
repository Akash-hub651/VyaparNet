import React, { useEffect } from 'react';
import { X } from 'lucide-react';

export interface FilterDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export function FilterDrawer({ isOpen, onClose }: FilterDrawerProps) {
  
  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-neutral-900/50 z-[40] transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />
      
      {/* Drawer */}
      <div 
        className="fixed inset-y-0 right-0 w-full sm:w-[320px] bg-surface-default shadow-3 z-[50] flex flex-col transform transition-transform animate-slide-in-right"
        role="dialog"
        aria-modal="true"
        aria-label="Orders filter karein"
      >
        <div className="flex items-center justify-between p-4 border-b border-border-default">
          <h2 className="text-lg font-bold text-text-primary">Filters</h2>
          <button 
            onClick={onClose}
            className="text-text-muted hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded p-1"
            aria-label="Close filters"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          {/* Status */}
          <section>
            <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-3">Order Status</h3>
            <div className="space-y-3">
              {['PLACED', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'COMPLETED', 'CANCELLED', 'DISPUTE_OPEN'].map(status => (
                <label key={status} className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" className="w-4 h-4 rounded border-border-default text-brand-600 focus:ring-brand-500" />
                  <span className="text-sm font-medium text-text-primary">{status}</span>
                </label>
              ))}
            </div>
          </section>

          {/* Date Range */}
          <section>
            <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-3">Date Range</h3>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <button className="px-3 py-1.5 text-xs font-medium bg-surface-hover rounded border border-border-default hover:border-brand-300">Today</button>
              <button className="px-3 py-1.5 text-xs font-medium bg-surface-hover rounded border border-border-default hover:border-brand-300">Yesterday</button>
              <button className="px-3 py-1.5 text-xs font-medium bg-surface-hover rounded border border-border-default hover:border-brand-300">This Week</button>
              <button className="px-3 py-1.5 text-xs font-medium bg-brand-50 text-brand-700 rounded border border-brand-200">This Month</button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-text-secondary mb-1">From</label>
                <input type="date" className="w-full px-2 py-1.5 text-base sm:text-sm border border-border-default rounded focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
              <div>
                <label className="block text-xs text-text-secondary mb-1">To</label>
                <input type="date" className="w-full px-2 py-1.5 text-base sm:text-sm border border-border-default rounded focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
            </div>
          </section>

          {/* Amount Range */}
          <section>
            <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-3">Amount Range</h3>
            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-text-muted text-sm">₹</span>
                <input type="number" placeholder="Min" className="w-full pl-6 pr-2 py-1.5 text-base sm:text-sm border border-border-default rounded focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
              <span className="text-text-muted">-</span>
              <div className="relative flex-1">
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-text-muted text-sm">₹</span>
                <input type="number" placeholder="Max" className="w-full pl-6 pr-2 py-1.5 text-base sm:text-sm border border-border-default rounded focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
            </div>
          </section>

          {/* Segment */}
          <section>
            <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-3">Segment</h3>
            <div className="space-y-3">
              {['Textile', 'Spare Parts', 'Electronics', 'Agriculture'].map(segment => (
                <label key={segment} className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" className="w-4 h-4 rounded border-border-default text-brand-600 focus:ring-brand-500" />
                  <span className="text-sm font-medium text-text-primary">{segment}</span>
                </label>
              ))}
            </div>
          </section>
        </div>

        <div className="p-4 border-t border-border-default flex items-center justify-between gap-3 bg-surface-hover">
          <button 
            onClick={onClose}
            className="px-4 py-2 text-sm font-semibold text-text-secondary hover:text-text-primary focus-visible:outline-none"
          >
            Saare Filters Hata Dein
          </button>
          <button 
            onClick={onClose}
            className="px-6 py-2 text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1"
          >
            Apply Filters
          </button>
        </div>
      </div>
    </>
  );
}
