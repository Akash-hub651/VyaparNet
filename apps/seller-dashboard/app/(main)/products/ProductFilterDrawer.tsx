import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { useAuth } from '../../../app/contexts/auth.context';
import { deriveSegmentOptions } from '../../../lib/segments';

interface ProductFilterDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ProductFilterDrawer({ isOpen, onClose }: ProductFilterDrawerProps): React.JSX.Element | null {
  const containerRef = useRef<HTMLDivElement>(null);
  const { user } = useAuth();

  /**
   * D-03 FIX — Segment Isolation
   * Authority: seller_dashboard_architecture.md §21
   * Segment options derived from user.businesses[0].segment (backend-driven).
   * Adding a new segment requires ZERO changes to this component.
   * Sprint 10 TODO: Replace with GET /api/v1/segments when endpoint is live.
   */
  const segmentOptions = deriveSegmentOptions(
    user?.businesses?.[0]?.segment as string | undefined,
  );

  // Close on Escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // Lock body scroll
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <>
      <div 
        className="fixed inset-0 bg-black/40 backdrop-blur-sm z-60 animate-[fadeIn_150ms_ease]"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-label="Filter Products"
        className={`fixed inset-y-0 right-0 w-full max-w-sm bg-surface-card shadow-3 z-60 flex flex-col transform transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-default">
          <h2 className="text-lg font-semibold text-text-primary">Filters</h2>
          <button
            onClick={onClose}
            className="p-1.5 text-text-muted hover:text-text-primary hover:bg-surface-hover rounded-md transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Close filters"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Status Checkboxes */}
          <div>
            <h3 className="text-sm font-semibold text-text-primary mb-3">Product Status</h3>
            <div className="space-y-3">
              {['Active', 'Pending Review', 'Draft', 'Rejected', 'Archived'].map(status => (
                <label key={status} className="flex items-center gap-3">
                  <input type="checkbox" className="rounded border-border-strong text-brand-600 focus:ring-brand-500 min-w-[24px] min-h-[24px]" />
                  <span className="text-sm text-text-secondary">{status}</span>
                </label>
              ))}
            </div>
          </div>

          <hr className="border-border-default" />

          {/* Segment */}
          <div>
            <h3 className="text-sm font-semibold text-text-primary mb-3">Segment</h3>
            <select className="w-full px-3 py-2 text-sm border border-border-default rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500 bg-surface-default min-h-[44px]">
              <option value="">All Segments</option>
              {segmentOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          <hr className="border-border-default" />

          {/* Price Range */}
          <div>
            <h3 className="text-sm font-semibold text-text-primary mb-3">Price Range</h3>
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <label className="sr-only">Min Price</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted text-sm">₹</span>
                  <input 
                    type="number" 
                    placeholder="Min" 
                    inputMode="decimal"
                    className="w-full pl-7 pr-3 py-2 text-sm border border-border-default rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500 min-h-[44px]"
                  />
                </div>
              </div>
              <span className="text-text-muted text-sm">to</span>
              <div className="flex-1">
                <label className="sr-only">Max Price</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted text-sm">₹</span>
                  <input 
                    type="number" 
                    placeholder="Max" 
                    inputMode="decimal"
                    className="w-full pl-7 pr-3 py-2 text-sm border border-border-default rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500 min-h-[44px]"
                  />
                </div>
              </div>
            </div>
          </div>

          <hr className="border-border-default" />

          {/* Stock */}
          <div>
            <h3 className="text-sm font-semibold text-text-primary mb-3">Stock</h3>
            <div className="space-y-3">
              <label className="flex items-center gap-3">
                <input type="checkbox" className="rounded border-border-strong text-brand-600 focus:ring-brand-500 min-w-[24px] min-h-[24px]" />
                <span className="text-sm text-text-secondary">In stock only</span>
              </label>
              <label className="flex items-center gap-3">
                <input type="checkbox" className="rounded border-border-strong text-brand-600 focus:ring-brand-500 min-w-[24px] min-h-[24px]" />
                <span className="text-sm text-error-600 font-medium">Out of stock only</span>
              </label>
              <label className="flex items-center gap-3">
                <input type="checkbox" className="rounded border-border-strong text-brand-600 focus:ring-brand-500 min-w-[24px] min-h-[24px]" />
                <span className="text-sm text-warning-700 font-medium">Low stock</span>
              </label>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-border-default flex items-center justify-between">
          <button className="text-sm font-medium text-text-muted hover:text-text-primary min-h-[44px] px-2">
            Clear all
          </button>
          <Button variant="primary" onClick={onClose}>
            Show Results
          </Button>
        </div>
      </div>
    </>
  );
}
