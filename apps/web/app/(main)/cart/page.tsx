'use client';

/**
 * Cart Page — apps/web/app/(main)/cart/page.tsx
 *
 * Authority: SPRINT_4_EXECUTION_LOCK_FINAL.md §22 (PHASE 8 — FRONTEND)
 *
 * Requirements:
 * - Render Cart items with quantity steppers (bound: MOQ <= qty <= live stock)
 * - MOQ validation: red border + "Minimum X pieces required"
 * - Warnings: Banners for PRODUCT_INACTIVE, OUT_OF_STOCK, PRICE_CHANGED
 * - Sticky "Checkout" CTA (disabled on MOQ violation / stock block)
 * - Empty cart state: "Cart mein kuch nahi hai — Browse karein"
 * - SWR polling: 30s refresh for live stock updates
 */

import React, { Suspense, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import useSWR, { mutate } from 'swr';
import Link from 'next/link';
import { useAuth } from '../../contexts/auth.context';
import { getCart, updateCartItem, removeFromCart } from '../../../lib/api/cart.client';
import { Segment } from '@vyaparnet/types';
import { getApiBaseUrl } from '../../../lib/config';

// INR Curreny Formatter
const inrFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 0,
});

// fetcher for live stock updates
const stockFetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch stock');
  const json = await res.json() as { success: boolean; data: { availableQuantity: number; isLowStock: boolean } };
  return json.data;
};

// Component for rendering a single cart item
interface CartItemRowProps {
  item: any;
  segment: Segment;
  token: string;
  onMutation: () => void;
}

function CartItemRow({ item, segment, token, onMutation }: CartItemRowProps): React.JSX.Element {
  const [updating, setUpdating] = useState(false);

  // Live stock polling (30s interval as per spec)
  const { data: stockData } = useSWR(
    `${getApiBaseUrl()}/api/v1/inventory/${item.productId}?segment=${segment}`,
    stockFetcher,
    { refreshInterval: 30000 },
  );

  const availableStock = stockData?.availableQuantity ?? item.quantity;
  const isOos = availableStock <= 0;
  const minRequired = item.moq ?? 1;
  const hasMoqViolation = item.quantity < minRequired;

  const handleQtyChange = async (newQty: number) => {
    if (newQty < 1 || updating) return;
    // Bound the maximum to live stock
    if (newQty > availableStock) {
      alert(`Sirf ${availableStock} units hi bache hain stock mein.`);
      return;
    }

    setUpdating(true);
    const res = await updateCartItem(item.productId, segment, newQty, token);
    setUpdating(false);
    if (!res.error) {
      onMutation();
    }
  };

  const handleRemove = async () => {
    if (updating) return;
    setUpdating(true);
    const res = await removeFromCart(item.productId, segment, token);
    setUpdating(false);
    if (!res.error) {
      onMutation();
    }
  };

  return (
    <div
      id={`cart-item-${item.productId}`}
      className={`p-5 bg-white rounded-2xl border transition-all duration-300 flex flex-col sm:flex-row gap-5 items-center justify-between ${
        hasMoqViolation ? 'border-[#EF4444] shadow-[0_0_12px_rgba(239,68,68,0.1)]' : 'border-[#E2E8F0] hover:border-[#CBD5E1] shadow-sm'
      }`}
    >
      {/* Product Information */}
      <div className="flex items-center gap-4 flex-1 w-full">
        <div className="w-20 h-20 bg-slate-100 rounded-xl overflow-hidden flex-shrink-0 flex items-center justify-center border border-slate-200">
          {item.productImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.productImage} alt={item.productName} className="object-cover w-full h-full" />
          ) : (
            <span className="text-2xl">📦</span>
          )}
        </div>
        <div className="flex-1 space-y-1">
          <Link
            href={`/products/${item.productSlug}`}
            className="text-lg font-bold text-[#1E293B] hover:text-[#2563EB] transition-colors line-clamp-1"
          >
            {item.productName}
          </Link>
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-sm font-semibold text-[#64748B]">
              {inrFormatter.format(item.unitPrice)}
            </span>
            <span className="text-xs bg-[#EFF6FF] text-[#2563EB] px-2 py-0.5 rounded-full font-medium">
              MOQ: {minRequired}
            </span>
            {stockData && (
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                isOos ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'
              }`}>
                Stock: {availableStock}
              </span>
            )}
          </div>

          {/* MOQ Alert banner inside item */}
          {hasMoqViolation && (
            <p className="text-xs font-semibold text-[#EF4444] flex items-center gap-1 mt-1" id="moq-warning-text">
              ⚠️ Minimum {minRequired} pieces required
            </p>
          )}
        </div>
      </div>

      {/* Stepper and price */}
      <div className="flex items-center justify-between sm:justify-end gap-6 w-full sm:w-auto border-t sm:border-0 pt-4 sm:pt-0">
        {/* Quantity Stepper */}
        <div className="flex items-center gap-1 bg-[#F1F5F9] p-1 rounded-lg border border-[#E2E8F0]">
          <button
            onClick={() => handleQtyChange(item.quantity - 1)}
            disabled={item.quantity <= 1 || updating}
            className="w-8 h-8 rounded bg-white border border-slate-200 text-[#1E293B] font-bold hover:bg-slate-50 transition-colors disabled:opacity-40 flex items-center justify-center text-sm"
            aria-label="Decrease quantity"
          >
            -
          </button>
          <span className="w-10 text-center text-sm font-bold text-[#1E293B]" id={`item-qty-${item.productId}`}>
            {item.quantity}
          </span>
          <button
            onClick={() => handleQtyChange(item.quantity + 1)}
            disabled={item.quantity >= availableStock || updating}
            className="w-8 h-8 rounded bg-white border border-slate-200 text-[#1E293B] font-bold hover:bg-slate-50 transition-colors disabled:opacity-40 flex items-center justify-center text-sm"
            aria-label="Increase quantity"
          >
            +
          </button>
        </div>

        {/* Price and Delete */}
        <div className="text-right flex items-center gap-4">
          <div>
            <p className="text-base font-extrabold text-[#1E293B]">
              {inrFormatter.format(item.unitPrice * item.quantity)}
            </p>
          </div>
          <button
            onClick={handleRemove}
            disabled={updating}
            className="p-2 text-slate-400 hover:text-[#EF4444] rounded-lg hover:bg-red-50 transition-all"
            aria-label="Delete item"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2M10 11v6M14 11v6" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

// Inner Component loaded within Suspense boundary
function CartPageInner(): React.JSX.Element {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { token, isAuthenticated, isLoading: authLoading } = useAuth();
  
  const segment = (searchParams.get('segment') as Segment) ?? Segment.TEXTILE;

  // Retrieve Cart data via useSWR
  const { data: cart, error, isLoading: cartLoading } = useSWR(
    token ? [`/api/v1/cart`, segment, token] : null,
    async () => {
      const res = await getCart(segment, token!);
      if (res.error) throw new Error(res.error.message);
      return res.data;
    },
  );

  if (authLoading || cartLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
        <div className="h-8 bg-slate-200 rounded w-1/4 animate-pulse" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-4">
            <div className="h-24 bg-slate-100 rounded-2xl animate-pulse" />
            <div className="h-24 bg-slate-100 rounded-2xl animate-pulse" />
          </div>
          <div className="h-64 bg-slate-100 rounded-2xl animate-pulse" />
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <div className="text-5xl mb-4">🔒</div>
        <h2 className="text-2xl font-bold text-[#1E293B] mb-2">Aap Logged In Nahi Hain</h2>
        <p className="text-slate-500 mb-6">Cart dekhne aur wholesale order karne ke liye login karein.</p>
        <Link
          href={`/login?redirect=/cart?segment=${segment}`}
          className="inline-block bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-semibold px-6 py-3 rounded-xl transition-all shadow-md hover:shadow-lg"
        >
          Login Karein
        </Link>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-16 text-center">
        <p className="text-[#EF4444] font-semibold mb-3">Cart load karne mein samasya aayi</p>
        <p className="text-sm text-slate-500 mb-6">{error.message}</p>
        <button
          onClick={() => void mutate([`/api/v1/cart`, segment, token])}
          className="bg-[#2563EB] text-white px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-[#1D4ED8] transition-colors"
        >
          Try Again
        </button>
      </div>
    );
  }

  if (!cart) {
    return <React.Fragment />;
  }

  const items = cart?.items ?? [];
  const warnings = cart?.warnings ?? [];
  const total = cart?.total ?? 0;

  if (items.length === 0) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center" id="cart-empty-state">
        <div className="text-6xl mb-6">🛒</div>
        <h2 className="text-2xl font-extrabold text-[#1E293B] mb-3">
          Cart mein kuch nahi hai — Browse karein
        </h2>
        <p className="text-slate-500 mb-8 max-w-sm mx-auto">
          Bharat ke behtareen wholesale sellers se direct product kharidne ke liye shopping shuru karein.
        </p>
        <Link
          href={`/search?segment=${segment}`}
          className="inline-block bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold px-8 py-3.5 rounded-xl transition-all shadow-lg hover:-translate-y-0.5"
        >
          Product Khojein
        </Link>
      </div>
    );
  }

  // Determine if there are blockers for checkout (e.g. MOQ violations or out-of-stock items)
  const hasBlockers = items.some((item) => {
    const isOos = warnings.some((w) => w.productId === item.productId && w.type === 'OUT_OF_STOCK');
    const isMoqViolated = item.quantity < (item.moq ?? 1);
    return isOos || isMoqViolated;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Segment Indicator Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-extrabold text-[#1E293B]">Khareeddari Cart</h1>
          <p className="text-slate-500 text-sm mt-1">
            Segment: <span className="font-semibold text-[#2563EB] uppercase">{segment}</span>
          </p>
        </div>
        <Link
          href={`/search?segment=${segment}`}
          className="text-sm font-semibold text-[#2563EB] hover:text-[#1D4ED8] flex items-center gap-1.5 hover:underline"
        >
          ← Aur Products Add Karein
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        {/* Left Side: Items List & Warnings */}
        <div className="lg:col-span-2 space-y-6">
          {/* Cart-level Warnings */}
          {warnings.length > 0 && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-2">
              <h3 className="text-amber-800 font-bold text-sm flex items-center gap-1.5">
                ⚠️ Kripya dhyan dein (Cart updates):
              </h3>
              <ul className="list-disc list-inside text-xs text-amber-700 space-y-1">
                {warnings.map((w, idx) => (
                  <li key={idx} id={`cart-warning-${w.productId}`}>
                    {w.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Items List */}
          <div className="space-y-4">
            {items.map((item) => (
              <CartItemRow
                key={item.id}
                item={item}
                segment={segment}
                token={token!}
                onMutation={() => void mutate([`/api/v1/cart`, segment, token])}
              />
            ))}
          </div>
        </div>

        {/* Right Side: Order Summary (Sticky Summary) */}
        <div className="lg:sticky lg:top-24 space-y-6">
          <div className="p-6 bg-white rounded-2xl border border-slate-200 shadow-sm space-y-6">
            <h2 className="text-xl font-bold text-[#1E293B] border-b border-slate-100 pb-3">Order Summary</h2>

            {/* Calculations Breakdown */}
            <div className="space-y-3">
              <div className="flex justify-between text-sm text-slate-500">
                <span>Subtotal</span>
                <span className="font-semibold text-slate-800">{inrFormatter.format(cart.subtotal)}</span>
              </div>
              <div className="flex justify-between text-sm text-slate-500">
                <span>GST / Taxes</span>
                <span className="font-semibold text-slate-800">{inrFormatter.format(cart.taxAmount)}</span>
              </div>
              {cart.discount > 0 && (
                <div className="flex justify-between text-sm text-green-600">
                  <span>Discount</span>
                  <span className="font-semibold">{inrFormatter.format(-cart.discount)}</span>
                </div>
              )}
              <div className="border-t border-slate-100 pt-3 flex justify-between text-base font-extrabold text-[#1E293B]">
                <span>Grand Total</span>
                <span>{inrFormatter.format(total)}</span>
              </div>
            </div>

            {/* Warning when blockers prevent checkout */}
            {hasBlockers && (
              <p className="text-xs text-red-500 text-center font-medium bg-red-50 p-2.5 rounded-lg border border-red-100">
                Kuch items MOQ ko violate kar rahe hain ya out-of-stock hain. Kripya check karein.
              </p>
            )}

            {/* Checkout CTA */}
            <button
              id="cart-checkout-btn"
              onClick={() => router.push(`/checkout?segment=${segment}`)}
              disabled={hasBlockers}
              className="w-full bg-[#2563EB] hover:bg-[#1D4ED8] disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold py-4 px-6 rounded-xl transition-all shadow-md hover:shadow-lg disabled:shadow-none flex items-center justify-center gap-2"
            >
              Checkout Karein
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </button>

            <p className="text-xs text-slate-400 text-center leading-relaxed">
              Wholesale checkouts are processed in real-time. Delivery dates and logistics snapshots will be locked in the next step.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// Suspense wrapper for Cart page
export default function CartPage(): React.JSX.Element {
  return (
    <Suspense
      fallback={
        <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
          <div className="h-8 bg-slate-200 rounded w-1/4 animate-pulse" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-4">
              <div className="h-24 bg-slate-100 rounded-2xl animate-pulse" />
              <div className="h-24 bg-slate-100 rounded-2xl animate-pulse" />
            </div>
            <div className="h-64 bg-slate-100 rounded-2xl animate-pulse" />
          </div>
        </div>
      }
    >
      <CartPageInner />
    </Suspense>
  );
}
