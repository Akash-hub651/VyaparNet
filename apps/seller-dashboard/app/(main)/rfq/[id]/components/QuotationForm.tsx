"use client";

import React, { useState } from "react";
import { RfqViewModel, submitQuote } from "../../../../../lib/api/rfq.client";

interface QuotationFormProps {
  rfq: RfqViewModel;
  token: string;
  onSuccess: () => void;
}

export function QuotationForm({ rfq, token, onSuccess }: QuotationFormProps) {
  const [price, setPrice] = useState("");
  const [minQuantity, setMinQuantity] = useState("");
  const [deliveryDays, setDeliveryDays] = useState("");
  const [validity, setValidity] = useState("7");
  const [notes, setNotes] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Derived values
  const priceVal = parseFloat(price) || 0;
  const minQtyVal = parseFloat(minQuantity) || 0;
  const deliveryDaysVal = parseInt(deliveryDays, 10) || 0;

  const totalValue = priceVal * minQtyVal;

  // Extract buyer delivery requirement if present
  const buyerDeliveryStr =
    rfq.requirements?.Delivery ||
    rfq.requirements?.["Delivery Days"] ||
    rfq.requirements?.deliveryDays ||
    "";
  const buyerDeliveryDays =
    parseInt(String(buyerDeliveryStr).replace(/\D/g, "")) || 0;

  // Validation
  const isValid =
    priceVal > 0 &&
    minQtyVal > 0 &&
    minQtyVal <= rfq.quantity &&
    deliveryDaysVal > 0;

  // Warnings
  const priceWarning =
    rfq.budgetMax && priceVal > rfq.budgetMax
      ? "Aapka price buyer ke budget se zyada hai."
      : rfq.budgetMin && priceVal < rfq.budgetMin
        ? "Aapka price buyer ke min budget se kam hai."
        : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;

    setIsSubmitting(true);
    setSubmitError(null);

    const payload = {
      price: priceVal,
      minQuantity: minQtyVal,
      deliveryDays: deliveryDaysVal,
      validUntil: new Date(
        Date.now() + parseInt(validity) * 24 * 60 * 60 * 1000,
      ).toISOString(),
      notes,
    };

    const res = await submitQuote(rfq.id, payload, token);

    setIsSubmitting(false);

    if (res.error) {
      setSubmitError(res.error.message);
    } else {
      onSuccess();
    }
  };

  return (
    <div className="bg-surface-card rounded-xl shadow-1 border border-neutral-200 overflow-hidden">
      <div className="p-5 border-b border-neutral-200">
        <h2 className="text-lg font-semibold text-text-primary">
          Apna Quote Bhejein
        </h2>
      </div>

      <form onSubmit={handleSubmit} className="p-5 space-y-6">
        {submitError && (
          <div className="bg-error-50 text-error-700 p-3 rounded text-sm font-medium border border-error-100">
            Submit nahi ho paya. Dobara try karein.
          </div>
        )}

        {/* Price */}
        <div>
          <label className="block text-sm font-medium text-text-primary mb-2">
            Price per {rfq.unit} <span className="text-error-500">*</span>
          </label>
          {(rfq.budgetMin || rfq.budgetMax) && (
            <div className="mb-3 px-3 py-2 bg-info-50 text-info-700 text-xs rounded border border-info-100">
              Buyer budget: {rfq.budgetMin ? `₹${rfq.budgetMin}` : "0"}–
              {rfq.budgetMax ? `₹${rfq.budgetMax}` : "Open"}/{rfq.unit}
            </div>
          )}
          <div className="relative">
            <span className="absolute left-4 top-0 bottom-0 flex items-center text-xl lg:text-base text-text-secondary">
              ₹
            </span>
            <input
              type="text"
              inputMode="decimal"
              className="w-full pl-8 pr-8 py-2 bg-surface-base border border-neutral-300 rounded-lg text-center text-2xl lg:text-left lg:text-base h-14 lg:h-12 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none font-semibold transition-all"
              value={price}
              onChange={(e) => setPrice(e.target.value.replace(/[^0-9.]/g, ""))}
              required
            />
          </div>
          <p className="mt-1 text-xs text-text-secondary text-center lg:text-left">
            per {rfq.unit}
          </p>
          {priceWarning && priceVal > 0 && (
            <p className="mt-2 text-xs text-warning-700 font-medium">
              {priceWarning}
            </p>
          )}
        </div>

        {/* Min Quantity */}
        <div>
          <label className="block text-sm font-medium text-text-primary mb-2">
            Aap minimum kitna bhejenge?{" "}
            <span className="text-error-500">*</span>
          </label>
          <div className="relative">
            <input
              type="text"
              inputMode="decimal"
              className="w-full pl-4 pr-16 py-2 bg-surface-base border border-neutral-300 rounded-lg text-base h-12 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
              value={minQuantity}
              onChange={(e) =>
                setMinQuantity(e.target.value.replace(/[^0-9.]/g, ""))
              }
              required
            />
            <span className="absolute right-4 top-0 bottom-0 flex items-center text-text-secondary text-sm pointer-events-none">
              {rfq.unit}
            </span>
          </div>
          {minQtyVal > rfq.quantity && (
            <p className="mt-2 text-xs text-error-700 font-medium">
              Buyer ki requirement ({rfq.quantity} {rfq.unit}) se zyada nahi ho
              sakta.
            </p>
          )}
        </div>

        {/* Delivery Days */}
        <div>
          <label className="block text-sm font-medium text-text-primary mb-2">
            Delivery mein kitne din lagenge?{" "}
            <span className="text-error-500">*</span>
          </label>
          {buyerDeliveryDays > 0 && (
            <div className="mb-2 text-xs text-info-700">
              Buyer ne {buyerDeliveryDays} din mein chahiye likha hai
            </div>
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="w-12 h-12 flex-shrink-0 flex items-center justify-center border border-neutral-300 rounded-lg bg-surface-base active:bg-neutral-100 transition-colors"
              onClick={() => {
                const current = parseInt(deliveryDays, 10) || 0;
                if (current > 1) setDeliveryDays(String(current - 1));
              }}
              aria-label="Decrease delivery days"
            >
              <svg
                className="w-5 h-5 text-neutral-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M20 12H4"
                />
              </svg>
            </button>
            <div className="relative flex-1">
              <input
                type="text"
                inputMode="decimal"
                className="w-full pl-4 pr-16 py-2 bg-surface-base border border-neutral-300 rounded-lg text-center text-lg h-12 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none font-medium"
                value={deliveryDays}
                onChange={(e) =>
                  setDeliveryDays(e.target.value.replace(/\D/g, ""))
                }
                required
              />
              <span className="absolute right-4 top-0 bottom-0 flex items-center text-text-secondary text-sm pointer-events-none">
                din
              </span>
            </div>
            <button
              type="button"
              className="w-12 h-12 flex-shrink-0 flex items-center justify-center border border-neutral-300 rounded-lg bg-surface-base active:bg-neutral-100 transition-colors"
              onClick={() => {
                const current = parseInt(deliveryDays, 10) || 0;
                setDeliveryDays(String(current + 1));
              }}
              aria-label="Increase delivery days"
            >
              <svg
                className="w-5 h-5 text-neutral-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M12 4v16m8-8H4"
                />
              </svg>
            </button>
          </div>
          {buyerDeliveryDays > 0 && deliveryDaysVal > buyerDeliveryDays && (
            <p className="mt-2 text-xs text-warning-700 font-medium">
              Aapka delivery time buyer ki requirement se zyada hai.
            </p>
          )}
        </div>

        {/* Validity */}
        <div>
          <label className="block text-sm font-medium text-text-primary mb-2">
            Ye quote kitne din valid rahega?{" "}
            <span className="text-error-500">*</span>
          </label>
          <select
            className="w-full px-4 py-2 bg-surface-base border border-neutral-300 rounded-lg text-base h-12 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
            value={validity}
            onChange={(e) => setValidity(e.target.value)}
          >
            <option value="3">3 din</option>
            <option value="5">5 din</option>
            <option value="7">7 din</option>
            <option value="10">10 din</option>
          </select>
        </div>

        {/* Notes */}
        <div className="pb-8">
          <label className="block text-sm font-medium text-text-primary mb-2">
            Buyer ke liye koi special note?
          </label>
          <textarea
            rows={3}
            className="w-full px-4 py-3 bg-surface-base border border-neutral-300 rounded-lg text-base focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none resize-none"
            placeholder="Quality, certifications, delivery process..."
            maxLength={500}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        {/* Sticky Preview & Submit Wrapper */}
        <div className="sticky bottom-0 bg-white shadow-[0_-8px_16px_-4px_rgba(0,0,0,0.1)] lg:shadow-none border-t border-neutral-200 lg:border-none p-4 lg:p-0 -mx-5 lg:mx-0 -mb-5 lg:mb-0 z-10 space-y-4">
          {/* Preview */}
          <div className="bg-success-50 border border-success-200 rounded-lg p-4 space-y-1">
            <h4 className="text-xs font-semibold text-success-800 uppercase tracking-wider mb-2">
              Quote summary:
            </h4>
            <p className="text-sm text-success-900 flex justify-between">
              <span>Price:</span>
              <span className="font-medium">
                ₹{priceVal.toLocaleString("en-IN")}/{rfq.unit}
              </span>
            </p>
            <p className="text-sm text-success-900 flex justify-between">
              <span>Min order:</span>
              <span className="font-medium">
                {minQtyVal.toLocaleString("en-IN")} {rfq.unit}
              </span>
            </p>
            <p className="text-sm text-success-900 flex justify-between">
              <span>Delivery:</span>
              <span className="font-medium">
                {deliveryDaysVal > 0 ? `${deliveryDaysVal} din` : "-"}
              </span>
            </p>
            <div className="pt-2 mt-2 border-t border-success-200/50 text-sm text-success-900 flex justify-between">
              <span className="font-semibold">Total value:</span>
              <span className="font-bold tabular-nums">
                ₹{totalValue.toLocaleString("en-IN")}
              </span>
            </div>
          </div>

          {/* Submit */}
          <div className="space-y-2">
            <button
              type="submit"
              disabled={!isValid || isSubmitting}
              className="w-full flex items-center justify-center min-h-[48px] py-3 px-4 rounded-lg text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 disabled:bg-neutral-300 disabled:text-neutral-500 disabled:cursor-not-allowed transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-500"
            >
              {isSubmitting ? "Submitting..." : "Quote Submit Karein"}
            </button>
            <p className="text-[11px] text-text-secondary text-center leading-tight hidden lg:block">
              Quote submit karne ke baad aap usse wapas nahi le sakte
            </p>
          </div>
        </div>
      </form>
    </div>
  );
}
