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
          <label className="block text-sm font-medium text-text-primary mb-1">
            Price per {rfq.unit} <span className="text-error-500">*</span>
          </label>
          {(rfq.budgetMin || rfq.budgetMax) && (
            <div className="mb-2 px-3 py-2 bg-info-50 text-info-700 text-xs rounded border border-info-100">
              Buyer budget: {rfq.budgetMin ? `₹${rfq.budgetMin}` : "0"}–
              {rfq.budgetMax ? `₹${rfq.budgetMax}` : "Open"}/{rfq.unit}
            </div>
          )}
          <div className="relative">
            <span className="absolute left-3 top-2 text-text-secondary">₹</span>
            <input
              type="text"
              inputMode="decimal"
              className="w-full pl-7 pr-3 py-2 bg-surface-base border border-neutral-300 rounded-md text-sm focus:ring-1 focus:ring-brand-500 focus:border-brand-500 outline-none"
              value={price}
              onChange={(e) => setPrice(e.target.value.replace(/[^0-9.]/g, ""))}
              required
            />
          </div>
          {priceWarning && priceVal > 0 && (
            <p className="mt-1 text-xs text-warning-700">{priceWarning}</p>
          )}
        </div>

        {/* Min Quantity */}
        <div>
          <label className="block text-sm font-medium text-text-primary mb-1">
            Aap minimum kitna bhejenge?{" "}
            <span className="text-error-500">*</span>
          </label>
          <div className="relative">
            <input
              type="text"
              inputMode="decimal"
              className="w-full pl-3 pr-16 py-2 bg-surface-base border border-neutral-300 rounded-md text-sm focus:ring-1 focus:ring-brand-500 focus:border-brand-500 outline-none"
              value={minQuantity}
              onChange={(e) =>
                setMinQuantity(e.target.value.replace(/[^0-9.]/g, ""))
              }
              required
            />
            <span className="absolute right-3 top-2 text-text-secondary text-sm pointer-events-none">
              {rfq.unit}
            </span>
          </div>
          {minQtyVal > rfq.quantity && (
            <p className="mt-1 text-xs text-error-700">
              Buyer ki requirement ({rfq.quantity} {rfq.unit}) se zyada nahi ho
              sakta.
            </p>
          )}
        </div>

        {/* Delivery Days */}
        <div>
          <label className="block text-sm font-medium text-text-primary mb-1">
            Delivery mein kitne din lagenge?{" "}
            <span className="text-error-500">*</span>
          </label>
          {buyerDeliveryDays > 0 && (
            <div className="mb-2 text-xs text-info-700">
              Buyer ne {buyerDeliveryDays} din mein chahiye likha hai
            </div>
          )}
          <div className="relative">
            <input
              type="text"
              inputMode="decimal"
              className="w-full pl-3 pr-32 py-2 bg-surface-base border border-neutral-300 rounded-md text-sm focus:ring-1 focus:ring-brand-500 focus:border-brand-500 outline-none"
              value={deliveryDays}
              onChange={(e) =>
                setDeliveryDays(e.target.value.replace(/\D/g, ""))
              }
              required
            />
            <span className="absolute right-3 top-2 text-text-secondary text-sm pointer-events-none">
              din (working days)
            </span>
          </div>
          {buyerDeliveryDays > 0 && deliveryDaysVal > buyerDeliveryDays && (
            <p className="mt-1 text-xs text-warning-700">
              Aapka delivery time buyer ki requirement se zyada hai.
            </p>
          )}
        </div>

        {/* Validity */}
        <div>
          <label className="block text-sm font-medium text-text-primary mb-1">
            Ye quote kitne din valid rahega?{" "}
            <span className="text-error-500">*</span>
          </label>
          <select
            className="w-full px-3 py-2 bg-surface-base border border-neutral-300 rounded-md text-sm focus:ring-1 focus:ring-brand-500 focus:border-brand-500 outline-none"
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
        <div>
          <label className="block text-sm font-medium text-text-primary mb-1">
            Buyer ke liye koi special note?
          </label>
          <textarea
            rows={3}
            className="w-full px-3 py-2 bg-surface-base border border-neutral-300 rounded-md text-sm focus:ring-1 focus:ring-brand-500 focus:border-brand-500 outline-none resize-none"
            placeholder="Quality, certifications, delivery process..."
            maxLength={500}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

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
        <div>
          <button
            type="submit"
            disabled={!isValid || isSubmitting}
            className="w-full flex items-center justify-center min-h-[44px] py-2.5 px-4 rounded-md text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 disabled:bg-neutral-300 disabled:text-neutral-500 disabled:cursor-not-allowed transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-500"
          >
            {isSubmitting ? "Submitting..." : "Quote Submit Karein"}
          </button>
          <p className="mt-2 text-xs text-text-secondary text-center">
            Quote submit karne ke baad aap usse wapas nahi le sakte
          </p>
        </div>
      </form>
    </div>
  );
}
