/**
 * FilterDrawer — apps/seller-dashboard/app/(main)/orders/FilterDrawer.tsx
 *
 * Authority: seller_dashboard_screen_system.md §02 (Orders List — Filter Drawer)
 *
 * HIGH-A1 FIX: All form inputs now have proper id + htmlFor labels (WCAG AA).
 * MEDIUM-BL1 FIX: Filter state is now lifted — onApply callback passes active
 *   filters to parent (orders/page.tsx) which wires them to getOrders() API params.
 * MEDIUM-SEG1 FIX: Segment list uses deriveSegmentOptions() from lib/segments.ts.
 *   No hardcoded segment arrays.
 */

import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { deriveSegmentOptions } from '../../../lib/segments';
import { OrderStatus } from '../../../lib/api/orders.client';

/* ── Types ─────────────────────────────────────────────── */

export interface OrderFilterState {
  statuses: OrderStatus[];
  segments: string[];
  dateFrom: string;
  dateTo: string;
  amountMin: string;
  amountMax: string;
}

export const EMPTY_ORDER_FILTER: OrderFilterState = {
  statuses: [],
  segments: [],
  dateFrom: '',
  dateTo: '',
  amountMin: '',
  amountMax: '',
};

const STATUS_OPTIONS: { value: OrderStatus; label: string }[] = [
  { value: 'PLACED', label: 'Placed (Pending)' },
  { value: 'CONFIRMED', label: 'Confirmed' },
  { value: 'PROCESSING', label: 'Processing' },
  { value: 'SHIPPED', label: 'Shipped' },
  { value: 'DELIVERED', label: 'Delivered' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'CANCELLED', label: 'Cancelled' },
  { value: 'DISPUTE_OPEN', label: 'Dispute Open' },
];

// Date presets
const DATE_PRESETS = [
  { label: 'Aaj', days: 0 },
  { label: 'Kal', days: 1 },
  { label: 'Is Hafte', days: 7 },
  { label: 'Is Mahine', days: 30 },
];

/* ── Props ─────────────────────────────────────────────── */

export interface FilterDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  activeFilters: OrderFilterState;
  onApply: (filters: OrderFilterState) => void;
  onClear: () => void;
}

/* ── Component ──────────────────────────────────────────── */

export function FilterDrawer({
  isOpen,
  onClose,
  activeFilters,
  onApply,
  onClear,
}: FilterDrawerProps) {
  // Local draft state — only committed to parent on "Apply"
  const [draft, setDraft] = useState<OrderFilterState>(activeFilters);

  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);

  // Sync draft when drawer opens (pick up any external filter changes)
  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen);
    if (isOpen) {
      setDraft(activeFilters);
    }
  }

  // Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Segment options from lib/segments — MEDIUM-SEG1 fix
  const segmentOptions = deriveSegmentOptions();

  const toggleStatus = (status: OrderStatus) => {
    setDraft((prev) => ({
      ...prev,
      statuses: prev.statuses.includes(status)
        ? prev.statuses.filter((s) => s !== status)
        : [...prev.statuses, status],
    }));
  };

  const toggleSegment = (segment: string) => {
    setDraft((prev) => ({
      ...prev,
      segments: prev.segments.includes(segment)
        ? prev.segments.filter((s) => s !== segment)
        : [...prev.segments, segment],
    }));
  };

  const applyDatePreset = (days: number) => {
    const now = new Date();
    const from = new Date(now);
    from.setDate(from.getDate() - days);
    setDraft((prev) => ({
      ...prev,
      dateFrom: from.toISOString().split('T')[0] ?? '',
      dateTo: now.toISOString().split('T')[0] ?? '',
    }));
  };

  const handleApply = () => {
    onApply(draft);
    onClose();
  };

  const handleClear = () => {
    setDraft(EMPTY_ORDER_FILTER);
    onClear();
    onClose();
  };

  const hasActiveFilters =
    draft.statuses.length > 0 ||
    draft.segments.length > 0 ||
    draft.dateFrom !== '' ||
    draft.dateTo !== '' ||
    draft.amountMin !== '' ||
    draft.amountMax !== '';

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-neutral-900/50 z-40 transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div
        className="fixed inset-y-0 right-0 w-full sm:w-[340px] bg-surface-default shadow-3 z-50 flex flex-col transform transition-transform animate-slide-in-right"
        role="dialog"
        aria-modal="true"
        aria-label="Orders filter karein"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border-default">
          <h2 className="text-lg font-bold text-text-primary" id="filter-drawer-title">
            Filters
            {hasActiveFilters && (
              <span className="ml-2 inline-flex items-center justify-center w-5 h-5 rounded-full bg-brand-600 text-white text-[10px] font-bold">
                {draft.statuses.length + draft.segments.length + (draft.dateFrom ? 1 : 0) + (draft.amountMin || draft.amountMax ? 1 : 0)}
              </span>
            )}
          </h2>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded p-1"
            aria-label="Filters band karein"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-7">

          {/* 1. Status */}
          <fieldset>
            <legend className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-3">
              Order Status
            </legend>
            <div className="space-y-2.5">
              {STATUS_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  htmlFor={`filter-status-${opt.value}`}
                  className="flex items-center gap-3 cursor-pointer"
                >
                  <input
                    id={`filter-status-${opt.value}`}
                    type="checkbox"
                    checked={draft.statuses.includes(opt.value)}
                    onChange={() => toggleStatus(opt.value)}
                    className="w-4 h-4 rounded border-border-default text-brand-600 focus:ring-brand-500"
                  />
                  <span className="text-sm font-medium text-text-primary">{opt.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          {/* 2. Date Range */}
          <fieldset>
            <legend className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-3">
              Date Range
            </legend>
            {/* Quick presets */}
            <div className="grid grid-cols-4 gap-1.5 mb-3">
              {DATE_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => applyDatePreset(preset.days)}
                  className="px-2 py-1.5 text-xs font-medium bg-surface-hover rounded border border-border-default hover:border-brand-300 hover:bg-brand-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                >
                  {preset.label}
                </button>
              ))}
            </div>
            {/* Custom date inputs — HIGH-A1 FIX: id + htmlFor */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="filter-date-from"
                  className="block text-xs text-text-secondary mb-1"
                >
                  Se (From)
                </label>
                <input
                  id="filter-date-from"
                  type="date"
                  value={draft.dateFrom}
                  onChange={(e) => setDraft((p) => ({ ...p, dateFrom: e.target.value }))}
                  className="w-full px-2 py-1.5 text-base sm:text-sm border border-border-default rounded focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
              <div>
                <label
                  htmlFor="filter-date-to"
                  className="block text-xs text-text-secondary mb-1"
                >
                  Tak (To)
                </label>
                <input
                  id="filter-date-to"
                  type="date"
                  value={draft.dateTo}
                  onChange={(e) => setDraft((p) => ({ ...p, dateTo: e.target.value }))}
                  className="w-full px-2 py-1.5 text-base sm:text-sm border border-border-default rounded focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
            </div>
          </fieldset>

          {/* 3. Amount Range — HIGH-A1 FIX: id + htmlFor */}
          <fieldset>
            <legend className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-3">
              Amount Range
            </legend>
            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <label htmlFor="filter-amount-min" className="sr-only">
                  Minimum amount
                </label>
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-text-muted text-sm" aria-hidden="true">₹</span>
                <input
                  id="filter-amount-min"
                  type="number"
                  placeholder="Min"
                  value={draft.amountMin}
                  onChange={(e) => setDraft((p) => ({ ...p, amountMin: e.target.value }))}
                  className="w-full pl-6 pr-2 py-1.5 text-base sm:text-sm border border-border-default rounded focus:outline-none focus:ring-2 focus:ring-brand-500"
                  min="0"
                />
              </div>
              <span className="text-text-muted" aria-hidden="true">–</span>
              <div className="relative flex-1">
                <label htmlFor="filter-amount-max" className="sr-only">
                  Maximum amount
                </label>
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-text-muted text-sm" aria-hidden="true">₹</span>
                <input
                  id="filter-amount-max"
                  type="number"
                  placeholder="Max"
                  value={draft.amountMax}
                  onChange={(e) => setDraft((p) => ({ ...p, amountMax: e.target.value }))}
                  className="w-full pl-6 pr-2 py-1.5 text-base sm:text-sm border border-border-default rounded focus:outline-none focus:ring-2 focus:ring-brand-500"
                  min="0"
                />
              </div>
            </div>
          </fieldset>

          {/* 4. Segment — MEDIUM-SEG1 FIX: uses deriveSegmentOptions() */}
          <fieldset>
            <legend className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-3">
              Segment
            </legend>
            <div className="space-y-2.5">
              {segmentOptions.map((opt) => (
                <label
                  key={opt.value}
                  htmlFor={`filter-segment-${opt.value}`}
                  className="flex items-center gap-3 cursor-pointer"
                >
                  <input
                    id={`filter-segment-${opt.value}`}
                    type="checkbox"
                    checked={draft.segments.includes(opt.value)}
                    onChange={() => toggleSegment(opt.value)}
                    className="w-4 h-4 rounded border-border-default text-brand-600 focus:ring-brand-500"
                  />
                  <span className="text-sm font-medium text-text-primary">{opt.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border-default flex items-center justify-between gap-3 bg-surface-hover">
          <button
            type="button"
            onClick={handleClear}
            className="px-4 py-2.5 text-sm font-semibold text-text-secondary hover:text-error-600 hover:bg-error-50 rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-error-500"
          >
            Saaf Karein
          </button>
          <button
            type="button"
            onClick={handleApply}
            className="flex-1 px-6 py-2.5 text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1"
          >
            Apply Filters{hasActiveFilters && ` (${draft.statuses.length + draft.segments.length + (draft.dateFrom ? 1 : 0) + (draft.amountMin || draft.amountMax ? 1 : 0)})`}
          </button>
        </div>
      </div>
    </>
  );
}
