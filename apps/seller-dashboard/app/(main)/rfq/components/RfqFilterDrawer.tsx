"use client";

import React, { useState } from "react";
import { RfqStatus } from "../../../../lib/api/rfq.client";
import { useAuth } from "../../../contexts/auth.context";
import { deriveSegmentOptions } from "../../../../lib/segments";

export interface RfqFilters {
  segments: string[];
  statuses: RfqStatus[];
  budgetMin: string;
  budgetMax: string;
  expiry: string; // 'today', 'this_week', 'custom', ''
  showClosed: boolean;
}

interface RfqFilterDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  filters: RfqFilters;
  onApply: (f: RfqFilters) => void;
  onReset: () => void;
}

/**
 * D-03 FIX — Segment Isolation
 * Authority: seller_dashboard_architecture.md §21
 * The hardcoded SEGMENTS constant is removed.
 * Segment options are derived from backend user profile via useAuth().
 * Sprint 10 TODO: Replace deriveSegmentOptions() internals with GET /api/v1/segments.
 */
const STATUSES: { value: RfqStatus; label: string }[] = [
  { value: "NOT_QUOTED", label: "Not Quoted" },
  { value: "QUOTED", label: "Quoted" },
  { value: "EXPIRED", label: "Expired" },
];

export function RfqFilterDrawer({
  isOpen,
  onClose,
  filters,
  onApply,
  onReset,
}: RfqFilterDrawerProps) {
  const [local, setLocal] = useState<RfqFilters>(filters);
  const { user } = useAuth();

  // Segment options derived from user profile — backend-driven, not hardcoded
  const segmentOptions = deriveSegmentOptions(
    user?.businesses?.[0]?.segment as string | undefined,
  );

  // Sync when opened
  React.useEffect(() => {
    if (isOpen) {
      setTimeout(() => setLocal(filters), 0);
    }
  }, [isOpen, filters]);

  if (!isOpen) return null;

  const handleToggleSegment = (seg: string) => {
    setLocal((p) => ({
      ...p,
      segments: p.segments.includes(seg)
        ? p.segments.filter((s) => s !== seg)
        : [...p.segments, seg],
    }));
  };

  const handleToggleStatus = (status: RfqStatus) => {
    setLocal((p) => ({
      ...p,
      statuses: p.statuses.includes(status)
        ? p.statuses.filter((s) => s !== status)
        : [...p.statuses, status],
    }));
  };

  return (
    <>
      <div
        className="fixed inset-0 bg-neutral-900/50 z-60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className="fixed inset-y-0 right-0 w-[320px] bg-surface-card shadow-2 z-70 flex flex-col transform transition-transform duration-300"
        role="dialog"
        aria-modal="true"
        aria-label="Filter RFQs"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-neutral-200">
          <h2 className="text-lg font-semibold text-text-primary">Filters</h2>
          <button
            type="button"
            onClick={onReset}
            className="text-sm font-medium text-brand-600 hover:text-brand-700"
          >
            Reset All
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          {/* Segment */}
          <div role="group" aria-labelledby="filter-segment">
            <h3
              id="filter-segment"
              className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-3"
            >
              Segment
            </h3>
            <div className="space-y-2">
              {segmentOptions.map((opt) => (
                <label
                  key={opt.value}
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    className="rounded border-neutral-300 text-brand-600 focus:ring-brand-500 w-4 h-4"
                    checked={local.segments.includes(opt.value)}
                    onChange={() => handleToggleSegment(opt.value)}
                  />
                  <span className="text-sm text-text-primary">
                    {opt.label}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Status */}
          <div role="group" aria-labelledby="filter-status">
            <h3
              id="filter-status"
              className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-3"
            >
              Status
            </h3>
            <div className="space-y-2">
              {STATUSES.map((st) => (
                <label
                  key={st.value}
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    className="rounded border-neutral-300 text-brand-600 focus:ring-brand-500 w-4 h-4"
                    checked={local.statuses.includes(st.value)}
                    onChange={() => handleToggleStatus(st.value)}
                  />
                  <span className="text-sm text-text-primary">{st.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Budget Range */}
          <div>
            <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-3">
              Budget Range
            </h3>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <span className="absolute left-3 top-2 text-text-secondary">
                  ₹
                </span>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="Min"
                  className="w-full pl-7 pr-3 py-2 bg-surface-base border border-neutral-300 rounded-md text-sm focus:ring-1 focus:ring-brand-500 focus:border-brand-500 outline-none"
                  value={local.budgetMin}
                  onChange={(e) =>
                    setLocal({
                      ...local,
                      budgetMin: e.target.value.replace(/\D/g, ""),
                    })
                  }
                />
              </div>
              <span className="text-neutral-400">—</span>
              <div className="relative flex-1">
                <span className="absolute left-3 top-2 text-text-secondary">
                  ₹
                </span>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="Max"
                  className="w-full pl-7 pr-3 py-2 bg-surface-base border border-neutral-300 rounded-md text-sm focus:ring-1 focus:ring-brand-500 focus:border-brand-500 outline-none"
                  value={local.budgetMax}
                  onChange={(e) =>
                    setLocal({
                      ...local,
                      budgetMax: e.target.value.replace(/\D/g, ""),
                    })
                  }
                />
              </div>
            </div>
          </div>

          {/* Expiry */}
          <div>
            <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-3">
              Expiry
            </h3>
            <div className="flex flex-wrap gap-2">
              {[
                { id: "today", label: "Aaj" },
                { id: "this_week", label: "Is Hafte" },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() =>
                    setLocal({
                      ...local,
                      expiry: local.expiry === opt.id ? "" : opt.id,
                    })
                  }
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                    local.expiry === opt.id
                      ? "bg-brand-50 border-brand-200 text-brand-700"
                      : "bg-surface-base border-neutral-200 text-text-secondary hover:border-neutral-300"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Won / Lost Toggle */}
          <div>
            <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-3">
              Closed RFQs
            </h3>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="rounded border-neutral-300 text-brand-600 focus:ring-brand-500 w-4 h-4"
                checked={local.showClosed}
                onChange={(e) =>
                  setLocal({ ...local, showClosed: e.target.checked })
                }
              />
              <span className="text-sm text-text-primary">
                Closed RFQs bhi dikhaiye
              </span>
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-neutral-200 bg-neutral-50 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-text-secondary hover:text-text-primary transition-colors"
          >
            Saare Filters Hata Dein
          </button>
          <button
            type="button"
            onClick={() => {
              onApply(local);
              onClose();
            }}
            className="px-4 py-2 text-sm font-medium bg-brand-600 text-white rounded-md hover:bg-brand-700 transition-colors"
          >
            Apply Karein
          </button>
        </div>
      </div>
    </>
  );
}
