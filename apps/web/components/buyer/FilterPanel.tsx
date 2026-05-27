'use client';

/**
 * FilterPanel — apps/web/components/buyer/FilterPanel.tsx
 *
 * Authority: SPRINT2_IMPLEMENTATION_LOCKED_final_v2.0.md Section 9.2
 *
 * CRITICAL: Filter fields are rendered from category.filterConfig.filters JSONB.
 *           NEVER hardcode segment-specific filters here.
 *           If filterConfig is null/empty, show only category tree + price range.
 */

import React, { useState } from 'react';
import { Segment } from '@vyaparnet/types';
import type { CategoryResponse, FilterConfigField } from '../../lib/api/categories.client';
import type { ReadonlyURLSearchParams } from 'next/navigation';

interface FilterPanelProps {
  categories: CategoryResponse[];
  selectedCategoryId?: string;
  filterFields: FilterConfigField[];    // Driven by filterConfig — not hardcoded
  searchParams: ReadonlyURLSearchParams;
  onFilterChange: (key: string, value: string | undefined) => void;
  segment: Segment;
}

export default function FilterPanel({
  categories,
  selectedCategoryId,
  filterFields,
  searchParams,
  onFilterChange,
  segment,
}: FilterPanelProps): React.JSX.Element {
  const [priceMin, setPriceMin] = useState(searchParams.get('minPrice') ?? '');
  const [priceMax, setPriceMax] = useState(searchParams.get('maxPrice') ?? '');

  // Only show top-level and children for the current segment
  const segmentCategories = categories.filter((c) => c.segment === segment && !c.parentId);

  const handlePriceApply = (): void => {
    onFilterChange('minPrice', priceMin || undefined);
    onFilterChange('maxPrice', priceMax || undefined);
  };

  const handlePriceClear = (): void => {
    setPriceMin('');
    setPriceMax('');
    onFilterChange('minPrice', undefined);
    onFilterChange('maxPrice', undefined);
  };

  return (
    <nav aria-label="Search filters" className="space-y-5">
      <div className="text-sm font-semibold text-[#1E293B] flex items-center justify-between">
        <span>Filters</span>
        {/* Clear all */}
        {(selectedCategoryId || priceMin || priceMax || filterFields.some((f) => searchParams.get(f.key))) && (
          <button
            id="filter-clear-all"
            onClick={() => {
              setPriceMin('');
              setPriceMax('');
              onFilterChange('categoryId', undefined);
              onFilterChange('minPrice', undefined);
              onFilterChange('maxPrice', undefined);
              for (const f of filterFields) {
                onFilterChange(f.key, undefined);
              }
            }}
            className="text-xs text-[#2563EB] hover:text-[#1D4ED8] font-medium"
          >
            Clear all
          </button>
        )}
      </div>

      {/* ── Category filter ─────────────────────────────── */}
      <div>
        <h3 className="text-xs font-semibold text-[#64748B] uppercase tracking-wide mb-2">
          Category
        </h3>
        <div className="space-y-1">
          <button
            id="filter-category-all"
            onClick={() => onFilterChange('categoryId', undefined)}
            className={`w-full text-left text-sm px-2 py-1.5 rounded transition-colors ${
              !selectedCategoryId
                ? 'bg-[#EFF6FF] text-[#2563EB] font-medium'
                : 'text-[#1E293B] hover:bg-[#F8FAFC]'
            }`}
          >
            All Categories
          </button>

          {segmentCategories.map((cat) => (
            <div key={cat.id}>
              <button
                id={`filter-category-${cat.id}`}
                onClick={() => onFilterChange('categoryId', cat.id)}
                className={`w-full text-left text-sm px-2 py-1.5 rounded transition-colors ${
                  selectedCategoryId === cat.id
                    ? 'bg-[#EFF6FF] text-[#2563EB] font-medium'
                    : 'text-[#1E293B] hover:bg-[#F8FAFC]'
                }`}
              >
                {cat.name}
              </button>

              {/* Sub-categories */}
              {cat.children?.map((sub) => (
                <button
                  key={sub.id}
                  id={`filter-category-${sub.id}`}
                  onClick={() => onFilterChange('categoryId', sub.id)}
                  className={`w-full text-left text-sm pl-5 pr-2 py-1 rounded transition-colors ${
                    selectedCategoryId === sub.id
                      ? 'text-[#2563EB] font-medium'
                      : 'text-[#64748B] hover:text-[#1E293B]'
                  }`}
                >
                  {sub.name}
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* ── Price Range ──────────────────────────────────── */}
      <div>
        <h3 className="text-xs font-semibold text-[#64748B] uppercase tracking-wide mb-2">
          Price Range (₹)
        </h3>
        <div className="flex gap-2 items-center">
          <input
            id="filter-price-min"
            type="number"
            min={0}
            placeholder="Min"
            value={priceMin}
            onChange={(e) => setPriceMin(e.target.value)}
            className="w-full text-sm border border-[#E2E8F0] rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#2563EB]"
          />
          <span className="text-[#94A3B8] text-xs flex-shrink-0">to</span>
          <input
            id="filter-price-max"
            type="number"
            min={0}
            placeholder="Max"
            value={priceMax}
            onChange={(e) => setPriceMax(e.target.value)}
            className="w-full text-sm border border-[#E2E8F0] rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#2563EB]"
          />
        </div>
        <div className="flex gap-2 mt-2">
          <button
            id="filter-price-apply"
            onClick={handlePriceApply}
            className="flex-1 text-xs bg-[#2563EB] text-white rounded px-2 py-1.5 hover:bg-[#1D4ED8] transition-colors"
          >
            Apply
          </button>
          {(priceMin || priceMax) && (
            <button
              id="filter-price-clear"
              onClick={handlePriceClear}
              className="text-xs text-[#64748B] hover:text-[#1E293B] px-2 py-1.5"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* ── Dynamic segment attribute filters ───────────────
          Rendered from category.filterConfig.filters JSONB.
          This renders TEXTILE's gsm/fabric filters or SPARE_PARTS' make/model filters
          WITHOUT any hardcoded if (segment === 'TEXTILE') logic.
      ── */}
      {filterFields.map((field) => {
        const currentVal = searchParams.get(field.key) ?? '';

        if (field.type === 'range') {
          return (
            <div key={field.key}>
              <h3 className="text-xs font-semibold text-[#64748B] uppercase tracking-wide mb-2">
                {field.label} {field.unit ? `(${field.unit})` : ''}
              </h3>
              <div className="flex gap-2 items-center">
                <input
                  id={`filter-attr-${field.key}-min`}
                  type="number"
                  placeholder={String(field.min ?? 0)}
                  defaultValue={currentVal.split('-')[0] ?? ''}
                  className="w-full text-sm border border-[#E2E8F0] rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#2563EB]"
                  onBlur={(e) => {
                    const maxVal = (document.getElementById(`filter-attr-${field.key}-max`) as HTMLInputElement)?.value;
                    if (e.target.value) {
                      onFilterChange(field.key, `${e.target.value}-${maxVal}`);
                    }
                  }}
                />
                <span className="text-[#94A3B8] text-xs flex-shrink-0">–</span>
                <input
                  id={`filter-attr-${field.key}-max`}
                  type="number"
                  placeholder={String(field.max ?? '')}
                  defaultValue={currentVal.split('-')[1] ?? ''}
                  className="w-full text-sm border border-[#E2E8F0] rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#2563EB]"
                  onBlur={(e) => {
                    const minVal = (document.getElementById(`filter-attr-${field.key}-min`) as HTMLInputElement)?.value;
                    if (e.target.value) {
                      onFilterChange(field.key, `${minVal}-${e.target.value}`);
                    }
                  }}
                />
              </div>
            </div>
          );
        }

        if (field.type === 'multiselect' || field.type === 'select') {
          return (
            <div key={field.key}>
              <h3 className="text-xs font-semibold text-[#64748B] uppercase tracking-wide mb-2">
                {field.label}
              </h3>
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {field.options?.map((opt) => {
                  const isSelected = currentVal.split(',').includes(opt.value);
                  return (
                    <label
                      key={opt.value}
                      className="flex items-center gap-2 cursor-pointer hover:bg-[#F8FAFC] px-1 rounded py-0.5"
                    >
                      <input
                        id={`filter-attr-${field.key}-${opt.value}`}
                        type={field.type === 'multiselect' ? 'checkbox' : 'radio'}
                        name={field.key}
                        checked={isSelected}
                        onChange={() => {
                          if (field.type === 'multiselect') {
                            const vals = currentVal ? currentVal.split(',') : [];
                            const newVals = isSelected
                              ? vals.filter((v) => v !== opt.value)
                              : [...vals, opt.value];
                            onFilterChange(field.key, newVals.join(',') || undefined);
                          } else {
                            onFilterChange(field.key, opt.value);
                          }
                        }}
                        className="accent-[#2563EB]"
                      />
                      <span className="text-sm text-[#1E293B]">{opt.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          );
        }

        return null;
      })}
    </nav>
  );
}
