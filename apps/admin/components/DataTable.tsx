'use client';

import React from 'react';

// Column uses `unknown` for the render row so any typed domain object (SupportTicket,
// OrderListItem, etc.) is assignable without casting at each call site.
interface Column {
  key: string;
  header: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  render?: (row: any) => React.ReactNode;
  sortable?: boolean;
  width?: string;
}

interface DataTableProps<T extends Record<string, unknown>> {
  columns: Column[];
  data: T[];
  total: number;
  page: number;
  limit: number;
  onPageChange: (page: number) => void;
  /** If provided, enables row checkboxes and bulk action bar */
  onSelectionChange?: (selected: T[]) => void;
  /** Key in T to use as row identifier */
  rowKey: keyof T;
  loading?: boolean;
  emptyMessage?: string;
}

/**
 * DataTable — dense paginated table following VyaparNet admin UI spec.
 * 56px row height, sortable columns, optional bulk selection.
 */
export default function DataTable<T extends Record<string, unknown>>({
  columns,
  data,
  total,
  page,
  limit,
  onPageChange,
  onSelectionChange,
  rowKey,
  loading = false,
  emptyMessage = 'No data found.',
}: DataTableProps<T>): React.JSX.Element {
  const [selected, setSelected] = React.useState<Set<unknown>>(new Set());

  const totalPages = Math.ceil(total / limit);
  const startItem = (page - 1) * limit + 1;
  const endItem = Math.min(page * limit, total);

  const toggleAll = (): void => {
    if (selected.size === data.length) {
      setSelected(new Set());
      onSelectionChange?.([]);
    } else {
      const all = new Set(data.map((r) => r[rowKey]));
      setSelected(all);
      onSelectionChange?.(data);
    }
  };

  const toggleRow = (row: T): void => {
    const key = row[rowKey];
    const next = new Set(selected);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    setSelected(next);
    onSelectionChange?.(data.filter((r) => next.has(r[rowKey])));
  };

  return (
    <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0]">
              {onSelectionChange && (
                <th className="w-10 px-4 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={data.length > 0 && selected.size === data.length}
                    onChange={toggleAll}
                    className="rounded border-[#CBD5E1] text-[#2563EB] focus:ring-[#2563EB]"
                  />
                </th>
              )}
              {columns.map((col) => (
                <th
                  key={col.key}
                  className="px-4 py-3 text-left font-medium text-[#64748B] whitespace-nowrap"
                  style={col.width ? { width: col.width } : undefined}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F1F5F9]">
            {loading ? (
              <tr>
                <td
                  colSpan={columns.length + (onSelectionChange ? 1 : 0)}
                  className="h-14 text-center text-[#94A3B8]"
                >
                  Loading…
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length + (onSelectionChange ? 1 : 0)}
                  className="h-14 text-center text-[#94A3B8]"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              data.map((row) => (
                <tr
                  key={String(row[rowKey])}
                  className={`h-14 hover:bg-[#F8FAFC] transition-colors ${
                    selected.has(row[rowKey]) ? 'bg-blue-50' : ''
                  }`}
                >
                  {onSelectionChange && (
                    <td className="px-4">
                      <input
                        type="checkbox"
                        checked={selected.has(row[rowKey])}
                        onChange={() => toggleRow(row)}
                        className="rounded border-[#CBD5E1] text-[#2563EB] focus:ring-[#2563EB]"
                      />
                    </td>
                  )}
                  {columns.map((col) => (
                    <td key={col.key} className="px-4 text-[#1E293B]">
                      {col.render ? col.render(row) : String(row[col.key] ?? '')}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-[#E2E8F0] bg-[#F8FAFC]">
        <span className="text-sm text-[#64748B]">
          {total === 0 ? '0 results' : `${startItem}–${endItem} of ${total}`}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            className="px-3 py-1.5 text-sm rounded-lg border border-[#E2E8F0] text-[#64748B] hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            ← Prev
          </button>
          <span className="text-sm text-[#1E293B]">
            Page {page} / {totalPages || 1}
          </span>
          <button
            type="button"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            className="px-3 py-1.5 text-sm rounded-lg border border-[#E2E8F0] text-[#64748B] hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Next →
          </button>
        </div>
      </div>
    </div>
  );
}
