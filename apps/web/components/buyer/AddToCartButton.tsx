'use client';

/**
 * AddToCartButton — apps/web/components/buyer/AddToCartButton.tsx
 *
 * Authority: SPRINT_4_EXECUTION_LOCK_FINAL.md §22 (PHASE 8 — FRONTEND)
 *
 * Features:
 * - Stepper to input quantity (bounded: MOQ <= qty <= live stock)
 * - Add to Cart client-side API call
 * - Redirection or cart navigation help
 */

import React, { useState } from 'react';
import useSWR from 'swr';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../app/contexts/auth.context';
import { addToCart } from '../../lib/api/cart.client';
import { getApiBaseUrl } from '../../lib/config';
import { Segment } from '@vyaparnet/types';

interface AddToCartButtonProps {
  productId: string;
  moq: number;
  segment: string;
}

const stockFetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch stock');
  const json = await res.json() as { success: boolean; data: { availableQuantity: number } };
  return json.data;
};

export default function AddToCartButton({ productId, moq, segment }: AddToCartButtonProps): React.JSX.Element {
  const router = useRouter();
  const { token, isAuthenticated } = useAuth();
  
  // Real-time stock status polling to bound quantities
  const { data: stockData } = useSWR(
    `${getApiBaseUrl()}/api/v1/inventory/${productId}?segment=${segment}`,
    stockFetcher,
    { refreshInterval: 30000 },
  );

  const availableStock = stockData?.availableQuantity ?? 0;
  const isOos = availableStock <= 0;

  const [quantity, setQuantity] = useState(moq);
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleQtyChange = (val: number) => {
    if (val < moq) return;
    if (val > availableStock) return;
    setQuantity(val);
  };

  const handleAdd = async () => {
    if (!isAuthenticated) {
      router.push(`/login?redirect=/products/${productId}`);
      return;
    }

    setAdding(true);
    setErrorMsg(null);

    const res = await addToCart(
      {
        productId,
        quantity,
        segment: segment as Segment,
      },
      token!,
    );

    setAdding(false);

    if (res.error) {
      setErrorMsg(res.error.message);
    } else {
      setAdded(true);
      setTimeout(() => setAdded(false), 3000);
    }
  };

  return (
    <div className="space-y-4 w-full pt-2">
      {errorMsg && (
        <p className="text-xs font-semibold text-[#EF4444] bg-red-50 p-2 rounded border border-red-100">
          ⚠️ {errorMsg}
        </p>
      )}

      <div className="flex flex-col sm:flex-row gap-3 items-center">
        {/* Quantity selector */}
        {!isOos && (
          <div className="flex items-center gap-1 bg-[#F1F5F9] p-1 rounded-lg border border-[#E2E8F0] w-full sm:w-auto justify-between">
            <button
              onClick={() => handleQtyChange(quantity - 1)}
              disabled={quantity <= moq || adding}
              className="w-10 h-10 rounded bg-white border border-slate-200 text-[#1E293B] font-bold hover:bg-slate-50 transition-colors disabled:opacity-40 flex items-center justify-center text-sm"
              type="button"
              aria-label="Decrease quantity"
            >
              -
            </button>
            <span className="w-12 text-center text-sm font-bold text-[#1E293B]">
              {quantity}
            </span>
            <button
              onClick={() => handleQtyChange(quantity + 1)}
              disabled={quantity >= availableStock || adding}
              className="w-10 h-10 rounded bg-white border border-slate-200 text-[#1E293B] font-bold hover:bg-slate-50 transition-colors disabled:opacity-40 flex items-center justify-center text-sm"
              type="button"
              aria-label="Increase quantity"
            >
              +
            </button>
          </div>
        )}

        {/* Add to Cart CTA */}
        <div className="flex gap-2 w-full flex-1">
          <button
            onClick={handleAdd}
            disabled={isOos || adding}
            className={`flex-1 font-bold py-3.5 px-6 rounded-xl transition-all text-sm flex items-center justify-center gap-2 text-white shadow-md ${
              isOos
                ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
                : added
                ? 'bg-emerald-500 hover:bg-emerald-600'
                : 'bg-[#2563EB] hover:bg-[#1D4ED8]'
            }`}
            type="button"
          >
            {adding ? (
              'Adding...'
            ) : isOos ? (
              'Out of Stock'
            ) : added ? (
              <>
                <span>✓ Added to Cart</span>
              </>
            ) : (
              'Add to Cart'
            )}
          </button>

          {added && (
            <button
              onClick={() => router.push(`/cart?segment=${segment}`)}
              className="border-2 border-[#2563EB] text-[#2563EB] font-bold py-3.5 px-5 rounded-xl text-sm transition-colors hover:bg-blue-50"
              type="button"
            >
              View Cart
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
