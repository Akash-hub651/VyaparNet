'use client';

import React from 'react';
import useSWR from 'swr';
import { getApiBaseUrl } from '../../lib/config';

interface StockStatusProps {
  productId: string;
  segment: string;
}

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error('Failed to fetch stock status');
  }
  const json = await res.json();
  if (json && typeof json === 'object' && 'success' in json && json.success && 'data' in json) {
    return json.data;
  }
  return json;
};

/**
 * StockStatus Component — real-time inventory checking for buyers.
 *
 * Authority: SPRINT3_EXECUTION_LOCK_FINAL.md §24.1
 */
export default function StockStatus({ productId, segment }: StockStatusProps) {
  const { data, error } = useSWR(
    `${getApiBaseUrl()}/api/v1/inventory/${productId}?segment=${segment}`,
    fetcher,
    {
      refreshInterval: 30000, // SWR polling interval = 30s
      fallbackData: { availableQuantity: 0, isLowStock: false },
    }
  );

  if (error) {
    return (
      <span className="text-[#EF4444] font-medium text-sm">
        Stock status unavailable
      </span>
    );
  }

  const availableQuantity = data?.availableQuantity ?? 0;
  const isLowStock = data?.isLowStock ?? false;

  if (availableQuantity === 0) {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#FEE2E2] text-[#991B1B] border border-[#FCA5A5]" id="stock-status-badge">
        Stock khatam — Out of Stock
      </span>
    );
  }

  if (isLowStock) {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#FEF3C7] text-[#92400E] border border-[#FCD34D]" id="stock-status-badge">
        Sirf {availableQuantity} bache — Jaldi karein!
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#D1FAE5] text-[#065F46] border border-[#6EE7B7]" id="stock-status-badge">
      Available
    </span>
  );
}
