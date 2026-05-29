'use client';

/**
 * Checkout Page — apps/web/app/(main)/checkout/page.tsx
 *
 * Authority: SPRINT_4_EXECUTION_LOCK_FINAL.md §22 (PHASE 8 — FRONTEND)
 *
 * Flow (3 steps):
 * - Step 1: Address selection (saved addresses + "Add new address" form)
 * - Step 2: Payment method selection (COD default, Online payment option)
 * - Step 3: Order review (items, totals, address, no hidden charges)
 * - Disable submit button immediately on click
 * - Progress stepper at top
 * - Error state: "Payment fail ho gaya. Retry karein."
 * - Razorpay Sandbox Modal integration
 */

import React, { Suspense, useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import useSWR from 'swr';
import Link from 'next/link';
import { useAuth } from '../../contexts/auth.context';
import { getCart } from '../../../lib/api/cart.client';
import { getAddresses, createAddress } from '../../../lib/api/addresses.client';
import { createOrder, initiatePayment, getPaymentStatus } from '../../../lib/api/checkout.client';
import { Segment } from '@vyaparnet/types';

// Declare Razorpay on window interface
declare global {
  interface Window {
    Razorpay: any;
  }
}

const inrFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 0,
});

function CheckoutPageInner(): React.JSX.Element {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { token, user, isAuthenticated, isLoading: authLoading } = useAuth();
  const segment = (searchParams.get('segment') as Segment) ?? Segment.TEXTILE;

  // Wizard State
  const [step, setStep] = useState(1); // 1, 2, 3

  // Selection state
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'COD' | 'ONLINE_UPI' | 'ONLINE_CARD'>('COD');

  // Address creation form state
  const [showAddAddress, setShowAddAddress] = useState(false);
  const [newAddress, setNewAddress] = useState({
    name: '',
    line1: '',
    line2: '',
    city: '',
    state: '',
    pincode: '',
    landmark: '',
  });
  const [addressCreating, setAddressCreating] = useState(false);
  const [addressError, setAddressError] = useState<string | null>(null);

  // Submit and loading states
  const [placingOrder, setPlacingOrder] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [paymentPolling, setPaymentPolling] = useState(false);

  // Fetch Cart details
  const { data: cart } = useSWR(
    token ? [`/api/v1/cart`, segment, token] : null,
    async () => {
      const res = await getCart(segment, token!);
      if (res.error) throw new Error(res.error.message);
      return res.data;
    },
  );

  // Fetch Saved Addresses
  const { data: addresses, mutate: mutateAddresses } = useSWR(
    token ? [`/api/v1/users/addresses`, token] : null,
    async () => {
      const res = await getAddresses(token!);
      if (res.error) throw new Error(res.error.message);
      return res.data;
    },
  );

  // Pre-select default address on load
  useEffect(() => {
    if (addresses && addresses.length > 0 && !selectedAddressId) {
      const def = addresses.find((a) => a.isDefault) ?? addresses[0];
      setSelectedAddressId(def.id);
    }
  }, [addresses, selectedAddressId]);

  // Load Razorpay script dynamically
  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    document.body.appendChild(script);
    return () => {
      document.body.removeChild(script);
    };
  }, []);

  if (authLoading || !cart || !addresses) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 space-y-6">
        <div className="h-10 bg-slate-200 rounded w-1/3 animate-pulse mx-auto" />
        <div className="h-64 bg-slate-100 rounded-2xl animate-pulse" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <div className="text-5xl mb-4">🔒</div>
        <h2 className="text-2xl font-bold text-[#1E293B] mb-2">Aap Logged In Nahi Hain</h2>
        <p className="text-slate-500 mb-6">Checkout karne ke liye login karein.</p>
        <Link
          href={`/login?redirect=/checkout?segment=${segment}`}
          className="inline-block bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-semibold px-6 py-3 rounded-xl transition-all"
        >
          Login Karein
        </Link>
      </div>
    );
  }

  const items = cart.items ?? [];
  if (items.length === 0) {
    router.replace(`/cart?segment=${segment}`);
    return <React.Fragment />;
  }

  // Handle address creation submit
  const handleAddAddressSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddressError(null);

    // Simple client-side validation
    if (!newAddress.name || !newAddress.line1 || !newAddress.city || !newAddress.state || !newAddress.pincode) {
      setAddressError('Kripya sabhi mandatory fields bharein.');
      return;
    }
    if (!/^[1-9][0-9]{5}$/.test(newAddress.pincode)) {
      setAddressError('Invalid pincode format (6-digits required).');
      return;
    }

    setAddressCreating(true);
    const res = await createAddress(
      {
        ...newAddress,
        isDefault: addresses.length === 0, // Default if first address
      },
      token!,
    );
    setAddressCreating(false);

    if (res.error) {
      setAddressError(res.error.message);
    } else {
      setNewAddress({
        name: '',
        line1: '',
        line2: '',
        city: '',
        state: '',
        pincode: '',
        landmark: '',
      });
      setShowAddAddress(false);
      await mutateAddresses();
      setSelectedAddressId(res.data.id);
    }
  };

  // Poll payment status until confirmed
  const pollPaymentStatus = async (orderId: string, orderNumber: string) => {
    let attempts = 0;
    const interval = setInterval(async () => {
      attempts++;
      const res = await getPaymentStatus(orderId, token!);
      if (res.data?.status === 'CONFIRMED') {
        clearInterval(interval);
        setPlacingOrder(false);
        setPaymentPolling(false);
        router.push(`/checkout/confirmation?orderId=${orderId}&orderNumber=${orderNumber}`);
      } else if (attempts >= 10) { // Max 20 seconds polling
        clearInterval(interval);
        setPlacingOrder(false);
        setPaymentPolling(false);
        setCheckoutError('Payment verification timing out. Order status processing page par check karein.');
      }
    }, 2000);
  };

  // Handle Order Submit
  const handlePlaceOrder = async () => {
    if (!selectedAddressId || placingOrder) return;

    setPlacingOrder(true);
    setCheckoutError(null);

    // Generate unique client idempotency key
    const idempotencyKey = crypto.randomUUID();

    const orderRes = await createOrder(
      {
        shippingAddressId: selectedAddressId,
        billingAddressId: selectedAddressId,
        paymentMethod,
        segment,
      },
      idempotencyKey,
      token!,
    );

    if (orderRes.error) {
      setPlacingOrder(false);
      setCheckoutError(orderRes.error.message);
      return;
    }

    const orderData = orderRes.data;

    // COD Flow - complete immediately
    if (paymentMethod === 'COD') {
      setPlacingOrder(false);
      router.push(`/checkout/confirmation?orderId=${orderData.orderId}&orderNumber=${orderData.orderNumber}`);
      return;
    }

    // Online Flow: Initiate Razorpay payment
    const paymentKey = crypto.randomUUID();
    const paymentRes = await initiatePayment(orderData.orderId, paymentMethod, paymentKey, token!);

    if (paymentRes.error) {
      setPlacingOrder(false);
      setCheckoutError(paymentRes.error.message);
      return;
    }

    const paymentDetails = paymentRes.data;

    // Load Razorpay Sandbox modal
    const options = {
      key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || 'rzp_test_mock',
      amount: orderData.grandTotal * 100, // paise
      currency: 'INR',
      name: 'VyaparNet',
      description: `Wholesale Order VN-${orderData.orderNumber}`,
      order_id: paymentDetails.razorpayOrderId,
      handler: async function () {
        // Trigger status polling
        setPaymentPolling(true);
        await pollPaymentStatus(orderData.orderId, orderData.orderNumber);
      },
      prefill: {
        name: user?.name ?? '',
        contact: user?.phoneNumber ?? '',
      },
      theme: {
        color: '#2563EB',
      },
      modal: {
        ondismiss: function () {
          setPlacingOrder(false);
          setCheckoutError('Payment fail ho gaya. Retry karein.');
        },
      },
    };

    try {
      const rzp = new window.Razorpay(options);
      rzp.open();
    } catch {
      // Fallback: redirect directly to paymentUrl if script failed or crashed
      window.location.href = paymentDetails.paymentUrl;
    }
  };

  const selectedAddress = addresses.find((a) => a.id === selectedAddressId);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* ── Top Progress Stepper ── */}
      <nav aria-label="Progress" className="mb-10">
        <ol className="flex items-center justify-between max-w-lg mx-auto relative">
          <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-0.5 bg-slate-200 z-0" />
          <div
            className="absolute left-0 top-1/2 -translate-y-1/2 h-0.5 bg-[#2563EB] transition-all duration-300 z-0"
            style={{ width: `${((step - 1) / 2) * 100}%` }}
          />

          {[
            { num: 1, label: 'Delivery Address' },
            { num: 2, label: 'Payment Method' },
            { num: 3, label: 'Order Review' },
          ].map((s) => (
            <li key={s.num} className="z-10 flex flex-col items-center">
              <button
                onClick={() => step > s.num && setStep(s.num)}
                disabled={step <= s.num}
                className={`w-9 h-9 rounded-full font-bold flex items-center justify-center border text-sm transition-all ${
                  step === s.num
                    ? 'bg-[#2563EB] border-[#2563EB] text-white ring-4 ring-[#EFF6FF]'
                    : step > s.num
                    ? 'bg-emerald-500 border-emerald-500 text-white cursor-pointer'
                    : 'bg-white border-slate-200 text-slate-400 cursor-not-allowed'
                }`}
              >
                {step > s.num ? '✓' : s.num}
              </button>
              <span className={`text-xs font-semibold mt-2 ${step === s.num ? 'text-[#2563EB]' : 'text-slate-500'}`}>
                {s.label}
              </span>
            </li>
          ))}
        </ol>
      </nav>

      {/* ── Error Banner ── */}
      {checkoutError && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-sm font-semibold text-[#EF4444] text-center" id="checkout-error-banner">
          ⚠️ {checkoutError}
        </div>
      )}

      {/* ── Wizard Steps Content ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        {/* Main Content Area */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
          {/* STEP 1: ADDRESS SELECTION */}
          {step === 1 && (
            <div className="space-y-6">
              <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                <h2 className="text-xl font-bold text-[#1E293B]">Delivery Address Chunein</h2>
                <button
                  onClick={() => setShowAddAddress(!showAddAddress)}
                  className="text-sm font-semibold text-[#2563EB] hover:text-[#1D4ED8]"
                >
                  {showAddAddress ? 'Cancel' : '+ Add Address'}
                </button>
              </div>

              {/* Add New Address Form Inline */}
              {showAddAddress ? (
                <form onSubmit={handleAddAddressSubmit} className="space-y-4 bg-slate-50 p-5 rounded-xl border border-slate-100">
                  <h3 className="text-sm font-bold text-slate-700">Naya Address Add Karein</h3>
                  {addressError && <p className="text-xs font-semibold text-red-500">{addressError}</p>}
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                      <label className="block text-xs font-semibold text-slate-500 mb-1">Pura Naam *</label>
                      <input
                        type="text"
                        required
                        className="w-full border border-slate-200 rounded-lg p-2.5 text-sm"
                        value={newAddress.name}
                        onChange={(e) => setNewAddress({ ...newAddress, name: e.target.value })}
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs font-semibold text-slate-500 mb-1">Makaan / Sadak details (Line 1) *</label>
                      <input
                        type="text"
                        required
                        className="w-full border border-slate-200 rounded-lg p-2.5 text-sm"
                        value={newAddress.line1}
                        onChange={(e) => setNewAddress({ ...newAddress, line1: e.target.value })}
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs font-semibold text-slate-500 mb-1">Area / Colony / Gali (Line 2)</label>
                      <input
                        type="text"
                        className="w-full border border-slate-200 rounded-lg p-2.5 text-sm"
                        value={newAddress.line2}
                        onChange={(e) => setNewAddress({ ...newAddress, line2: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1">Kila / Landmark</label>
                      <input
                        type="text"
                        className="w-full border border-slate-200 rounded-lg p-2.5 text-sm"
                        value={newAddress.landmark}
                        onChange={(e) => setNewAddress({ ...newAddress, landmark: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1">Pincode *</label>
                      <input
                        type="text"
                        required
                        className="w-full border border-slate-200 rounded-lg p-2.5 text-sm"
                        value={newAddress.pincode}
                        onChange={(e) => setNewAddress({ ...newAddress, pincode: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1">City / Shahar *</label>
                      <input
                        type="text"
                        required
                        className="w-full border border-slate-200 rounded-lg p-2.5 text-sm"
                        value={newAddress.city}
                        onChange={(e) => setNewAddress({ ...newAddress, city: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1">State / Rajya *</label>
                      <input
                        type="text"
                        required
                        className="w-full border border-slate-200 rounded-lg p-2.5 text-sm"
                        value={newAddress.state}
                        onChange={(e) => setNewAddress({ ...newAddress, state: e.target.value })}
                      />
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={addressCreating}
                    className="w-full bg-[#2563EB] text-white font-bold py-2.5 rounded-lg text-sm transition-colors hover:bg-[#1D4ED8] disabled:bg-slate-300"
                  >
                    {addressCreating ? 'Saving...' : 'Save Address'}
                  </button>
                </form>
              ) : (
                <div className="space-y-3">
                  {addresses.map((a) => (
                    <label
                      key={a.id}
                      className={`block p-4 border rounded-xl cursor-pointer transition-all duration-200 ${
                        selectedAddressId === a.id
                          ? 'border-[#2563EB] bg-[#EFF6FF] shadow-sm'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <input
                          type="radio"
                          name="selectedAddress"
                          value={a.id}
                          checked={selectedAddressId === a.id}
                          onChange={() => setSelectedAddressId(a.id)}
                          className="mt-1"
                        />
                        <div className="text-sm">
                          <p className="font-bold text-slate-800">{a.name}</p>
                          <p className="text-slate-600 mt-1">{a.line1}, {a.line2 ? `${a.line2}, ` : ''}{a.city}, {a.state} - {a.pincode}</p>
                          {a.landmark && <p className="text-xs text-slate-400 mt-0.5">Landmark: {a.landmark}</p>}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              )}

              {/* Action button */}
              {!showAddAddress && (
                <button
                  id="checkout-step1-next"
                  onClick={() => selectedAddressId && setStep(2)}
                  disabled={!selectedAddressId}
                  className="w-full mt-4 bg-[#2563EB] hover:bg-[#1D4ED8] disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold py-3.5 rounded-xl transition-all"
                >
                  Payment Method Chunein →
                </button>
              )}
            </div>
          )}

          {/* STEP 2: PAYMENT METHOD */}
          {step === 2 && (
            <div className="space-y-6">
              <h2 className="text-xl font-bold text-[#1E293B] border-b border-slate-100 pb-3">Payment Method</h2>
              
              <div className="space-y-4">
                {/* Cash on Delivery */}
                <label
                  className={`block p-5 border rounded-xl cursor-pointer transition-all ${
                    paymentMethod === 'COD' ? 'border-[#2563EB] bg-[#EFF6FF]' : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="radio"
                      name="paymentMethod"
                      value="COD"
                      checked={paymentMethod === 'COD'}
                      onChange={() => setPaymentMethod('COD')}
                    />
                    <div>
                      <p className="font-bold text-slate-800 flex items-center gap-1.5">
                        Cash on Delivery (COD)
                        <span className="text-[10px] bg-[#E2E8F0] text-slate-600 px-2 py-0.5 rounded font-bold uppercase">Safe</span>
                      </p>
                      <p className="text-xs text-slate-500 mt-1">Delivery ke waqt cash me pay karein. Extra convenience fee ₹0.</p>
                    </div>
                  </div>
                </label>

                {/* UPI Online */}
                <label
                  className={`block p-5 border rounded-xl cursor-pointer transition-all ${
                    paymentMethod === 'ONLINE_UPI' ? 'border-[#2563EB] bg-[#EFF6FF]' : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="radio"
                      name="paymentMethod"
                      value="ONLINE_UPI"
                      checked={paymentMethod === 'ONLINE_UPI'}
                      onChange={() => setPaymentMethod('ONLINE_UPI')}
                    />
                    <div>
                      <p className="font-bold text-slate-800">Online payment via UPI</p>
                      <p className="text-xs text-slate-500 mt-1">GPay, PhonePe, Paytm sandbox gateway. Secure dynamic UPI handles payments.</p>
                    </div>
                  </div>
                </label>

                {/* Cards Online */}
                <label
                  className={`block p-5 border rounded-xl cursor-pointer transition-all ${
                    paymentMethod === 'ONLINE_CARD' ? 'border-[#2563EB] bg-[#EFF6FF]' : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="radio"
                      name="paymentMethod"
                      value="ONLINE_CARD"
                      checked={paymentMethod === 'ONLINE_CARD'}
                      onChange={() => setPaymentMethod('ONLINE_CARD')}
                    />
                    <div>
                      <p className="font-bold text-slate-800">Credit / Debit Card</p>
                      <p className="text-xs text-slate-500 mt-1">Visa, Mastercard, RuPay processing. Sandbox Razorpay interface.</p>
                    </div>
                  </div>
                </label>
              </div>

              <div className="flex gap-4 mt-6">
                <button
                  onClick={() => setStep(1)}
                  className="flex-1 border border-slate-200 text-slate-600 hover:bg-slate-50 font-bold py-3.5 rounded-xl transition-all"
                >
                  ← Wapas Jayein
                </button>
                <button
                  id="checkout-step2-next"
                  onClick={() => setStep(3)}
                  className="flex-1 bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold py-3.5 rounded-xl transition-all"
                >
                  Review Order →
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: ORDER REVIEW */}
          {step === 3 && (
            <div className="space-y-6">
              <h2 className="text-xl font-bold text-[#1E293B] border-b border-slate-100 pb-3">Review Your Order</h2>

              {/* Items List Summary */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Khareede ja rahe items</h3>
                <div className="border border-slate-100 rounded-xl overflow-hidden divide-y divide-slate-100">
                  {items.map((item) => (
                    <div key={item.id} className="p-4 flex justify-between items-center text-sm">
                      <div>
                        <p className="font-bold text-slate-800">{item.productName}</p>
                        <p className="text-xs text-slate-500 mt-0.5">Quantity: {item.quantity} × {inrFormatter.format(item.unitPrice)}</p>
                      </div>
                      <span className="font-bold text-slate-800">{inrFormatter.format(item.unitPrice * item.quantity)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Selected Details summary */}
              <div className="grid grid-cols-2 gap-4 border-t border-slate-100 pt-5">
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Delivery Address</h4>
                  <div className="text-xs text-slate-600 mt-2 space-y-1">
                    <p className="font-bold">{selectedAddress?.name}</p>
                    <p>{selectedAddress?.line1}</p>
                    {selectedAddress?.line2 && <p>{selectedAddress?.line2}</p>}
                    <p>{selectedAddress?.city}, {selectedAddress?.state} - {selectedAddress?.pincode}</p>
                  </div>
                </div>
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Payment Option</h4>
                  <p className="text-xs font-bold text-slate-700 mt-2">
                    {paymentMethod === 'COD'
                      ? 'Cash on Delivery (COD)'
                      : paymentMethod === 'ONLINE_UPI'
                      ? 'Online payment via UPI'
                      : 'Credit / Debit Card'}
                  </p>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex gap-4 mt-6">
                <button
                  onClick={() => setStep(2)}
                  disabled={placingOrder || paymentPolling}
                  className="flex-1 border border-slate-200 text-slate-600 hover:bg-slate-50 font-bold py-3.5 rounded-xl transition-all disabled:opacity-50"
                >
                  ← Wapas Jayein
                </button>
                <button
                  id="checkout-place-order-btn"
                  onClick={handlePlaceOrder}
                  disabled={placingOrder || paymentPolling}
                  className="flex-1 bg-[#2563EB] hover:bg-[#1D4ED8] disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold py-3.5 rounded-xl transition-all flex items-center justify-center gap-2"
                >
                  {placingOrder ? (
                    <>
                      <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      {paymentPolling ? 'Verifying payment...' : 'Order ho raha hai...'}
                    </>
                  ) : (
                    'Order Place Karein'
                  )}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Sidebar Summary (Visible on all steps) */}
        <div>
          <div className="p-6 bg-white border border-slate-200 rounded-2xl shadow-sm space-y-4">
            <h3 className="text-base font-bold text-[#1E293B] border-b border-slate-100 pb-2">Order Breakdown</h3>
            <div className="space-y-2.5 text-sm">
              <div className="flex justify-between text-slate-500">
                <span>Subtotal</span>
                <span className="font-semibold text-slate-800">{inrFormatter.format(cart.subtotal)}</span>
              </div>
              <div className="flex justify-between text-slate-500">
                <span>GST / Taxes</span>
                <span className="font-semibold text-slate-800">{inrFormatter.format(cart.taxAmount)}</span>
              </div>
              {cart.discount > 0 && (
                <div className="flex justify-between text-green-600">
                  <span>Discount</span>
                  <span>{inrFormatter.format(-cart.discount)}</span>
                </div>
              )}
              <div className="border-t border-slate-100 pt-2.5 flex justify-between text-base font-extrabold text-[#1E293B]">
                <span>Total Amount</span>
                <span>{inrFormatter.format(cart.total)}</span>
              </div>
            </div>

            <div className="p-3 bg-[#F8FAFC] rounded-lg text-[10px] text-slate-400 text-center">
              No hidden charges. Segment isolated wholesale transaction.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CheckoutPage(): React.JSX.Element {
  return (
    <Suspense
      fallback={
        <div className="max-w-3xl mx-auto px-4 py-16 space-y-6">
          <div className="h-10 bg-slate-200 rounded w-1/3 animate-pulse mx-auto" />
          <div className="h-64 bg-slate-100 rounded-2xl animate-pulse" />
        </div>
      }
    >
      <CheckoutPageInner />
    </Suspense>
  );
}
