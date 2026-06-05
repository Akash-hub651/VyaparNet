"use client";

import React from "react";
import { DraftData } from "./types";

interface Step2Props {
  draft: DraftData;
  updateDraft: <K extends keyof DraftData>(key: K, value: DraftData[K]) => void;
  isEditMode?: boolean;
  errors: Record<string, string>;
}

export function Step2Pricing({
  draft,
  errors,
  updateDraft,
  isEditMode = false,
}: Step2Props): React.JSX.Element {
  // Calculate live preview
  const basePrice = Number(draft.basePrice) || 0;
  const gstPercent = Number(draft.gstPercent) || 0;
  const gstAmount = (basePrice * gstPercent) / 100;
  const finalPrice = basePrice + gstAmount;

  return (
    <fieldset className="space-y-6">
      <legend className="sr-only">Step 2: Pricing & Stock</legend>
      <div className="space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Base Price */}
          <div>
            <label
              htmlFor="field-baseprice"
              className="block text-sm font-medium text-text-primary mb-1.5"
            >
              Ek unit ka price (₹){" "}
              <span className="text-error-500" aria-hidden="true">
                *
              </span>
            </label>
            <div className="relative">
              <span className="absolute left-4 top-3 text-text-secondary">
                ₹
              </span>
              <input
                id="field-baseprice"
                type="text"
                inputMode="decimal"
                value={draft.basePrice}
                onChange={(e) =>
                  updateDraft(
                    "basePrice",
                    e.target.value.replace(/[^0-9.]/g, ""),
                  )
                }
                aria-required="true"
                aria-invalid={!!errors["basePrice"]}
                aria-describedby={
                  errors["basePrice"] ? "error-baseprice" : undefined
                }
                className={`w-full bg-surface-card border rounded-lg pl-8 pr-4 py-3 text-base min-h-[44px] focus:outline-none focus:ring-2 focus:ring-brand-500 transition-colors ${
                  errors["basePrice"]
                    ? "border-error-500"
                    : "border-neutral-300"
                }`}
              />
            </div>
            {errors["basePrice"] && (
              <p
                id="error-baseprice"
                className="text-xs text-error-600 mt-1.5"
                role="alert"
              >
                {errors["basePrice"]}
              </p>
            )}
          </div>

          {/* Unit */}
          <div>
            <label
              htmlFor="field-unit"
              className="block text-sm font-medium text-text-primary mb-1.5"
            >
              Unit{" "}
              <span className="text-error-500" aria-hidden="true">
                *
              </span>
            </label>
            <select
              id="field-unit"
              value={draft.unit}
              onChange={(e) => updateDraft("unit", e.target.value)}
              aria-required="true"
              aria-invalid={!!errors["unit"]}
              aria-describedby={errors["unit"] ? "error-unit" : undefined}
              className={`w-full bg-surface-card border rounded-lg px-4 py-3 text-base min-h-[44px] focus:outline-none focus:ring-2 focus:ring-brand-500 transition-colors ${
                errors["unit"] ? "border-error-500" : "border-neutral-300"
              }`}
            >
              <option value="">Select unit</option>
              <option value="piece">Piece (pcs)</option>
              <option value="meter">Meter (m)</option>
              <option value="kg">Kilogram (kg)</option>
              <option value="litre">Litre (L)</option>
              <option value="pair">Pair</option>
              <option value="set">Set</option>
            </select>
            {errors["unit"] && (
              <p
                id="error-unit"
                className="text-xs text-error-600 mt-1.5"
                role="alert"
              >
                {errors["unit"]}
              </p>
            )}
          </div>

          {/* MOQ */}
          <div>
            <label
              htmlFor="field-moq"
              className="block text-sm font-medium text-text-primary mb-1.5"
            >
              Minimum order quantity
            </label>
            <div className="relative">
              <input
                id="field-moq"
                type="text"
                inputMode="decimal"
                value={draft.moq}
                onChange={(e) =>
                  updateDraft("moq", e.target.value.replace(/[^0-9]/g, ""))
                }
                placeholder="e.g., 10"
                aria-describedby="help-moq"
                className="w-full bg-surface-card border border-neutral-300 rounded-lg px-4 py-3 text-base min-h-[44px] focus:outline-none focus:ring-2 focus:ring-brand-500 transition-colors"
              />
              <span className="absolute right-4 top-3 text-text-secondary bg-surface-card">
                {draft.unit || "unit"}
              </span>
            </div>
            <p id="help-moq" className="text-xs text-text-secondary mt-1.5">
              Buyers isse kam order nahi kar sakte.
            </p>
          </div>

          {/* GST % */}
          <div>
            <label
              htmlFor="field-gst"
              className="block text-sm font-medium text-text-primary mb-1.5"
            >
              GST rate{" "}
              <span className="text-error-500" aria-hidden="true">
                *
              </span>
            </label>
            <select
              id="field-gst"
              value={draft.gstPercent}
              onChange={(e) => updateDraft("gstPercent", e.target.value)}
              aria-required="true"
              aria-invalid={!!errors["gstPercent"]}
              aria-describedby={errors["gstPercent"] ? "error-gst" : "help-gst"}
              className={`w-full bg-surface-card border rounded-lg px-4 py-3 text-base min-h-[44px] focus:outline-none focus:ring-2 focus:ring-brand-500 transition-colors ${
                errors["gstPercent"] ? "border-error-500" : "border-neutral-300"
              }`}
            >
              <option value="">Select GST rate</option>
              <option value="0">0%</option>
              <option value="5">5%</option>
              <option value="12">12%</option>
              <option value="18">18%</option>
              <option value="28">28%</option>
            </select>
            <p id="help-gst" className="text-xs text-text-secondary mt-1.5">
              Apne CA se confirm karein. Galat rate se compliance issue ho sakta
              hai.
            </p>
            {errors["gstPercent"] && (
              <p
                id="error-gst"
                className="text-xs text-error-600 mt-1.5"
                role="alert"
              >
                {errors["gstPercent"]}
              </p>
            )}
          </div>
        </div>

        {/* Live Price Preview Box */}
        <div className="bg-info-50 border border-info-200 rounded-lg p-4 mt-6 flex items-start gap-3">
          <span className="text-info-500 mt-0.5" aria-hidden="true">
            💡
          </span>
          <div>
            <p className="text-sm font-medium text-info-800">
              Live Price Preview
            </p>
            <p className="text-sm text-info-700 mt-1" aria-live="polite">
              ₹{basePrice.toLocaleString("en-IN")} (base) + ₹
              {gstAmount.toLocaleString("en-IN")} ({gstPercent}% GST) =
              <strong className="font-semibold ml-1">
                ₹{finalPrice.toLocaleString("en-IN")}
              </strong>{" "}
              (buyer ko dikhega)
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-4 border-t border-neutral-100">
          {/* Initial Stock / Current Stock */}
          <div>
            <label
              htmlFor="field-initial-stock"
              className="block text-sm font-medium text-text-primary mb-1.5"
            >
              {isEditMode ? "Current stock" : "Starting stock"}
              {!isEditMode && (
                <span className="text-error-500" aria-hidden="true">
                  *
                </span>
              )}
            </label>
            {isEditMode ? (
              <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-3 text-sm min-h-[44px] flex items-center justify-between">
                <span className="text-text-primary">
                  {draft.initialStock || 0} {draft.unit || "unit"}
                </span>
                <a href="/inventory" className="text-xs font-medium text-brand-600 hover:text-brand-700">
                  → Inventory se update karein
                </a>
              </div>
            ) : (
              <div className="relative">
                <input
                  id="field-initial-stock"
                  type="text"
                  inputMode="decimal"
                  value={draft.initialStock}
                  onChange={(e) =>
                    updateDraft(
                      "initialStock",
                      e.target.value.replace(/[^0-9]/g, ""),
                    )
                  }
                  aria-required="true"
                  aria-invalid={!!errors["initialStock"]}
                  aria-describedby={
                    errors["initialStock"]
                      ? "error-initial-stock"
                      : "help-initial-stock"
                  }
                  className={`w-full bg-surface-card border rounded-lg px-4 py-3 text-base min-h-[44px] focus:outline-none focus:ring-2 focus:ring-brand-500 transition-colors ${
                    errors["initialStock"]
                      ? "border-error-500"
                      : "border-neutral-300"
                  }`}
                />
                <span className="absolute right-4 top-3 text-text-secondary bg-surface-card">
                  {draft.unit || "unit"}
                </span>
              </div>
            )}
            {!isEditMode && (
              <p
                id="help-initial-stock"
                className="text-xs text-text-secondary mt-1.5"
              >
                Aap baad mein Inventory section se update kar sakte hain
              </p>
            )}
            {errors["initialStock"] && !isEditMode && (
              <p
                id="error-initial-stock"
                className="text-xs text-error-600 mt-1.5"
                role="alert"
              >
                {errors["initialStock"]}
              </p>
            )}
          </div>

          {/* Low Stock Alert */}
          <div>
            <label
              htmlFor="field-low-stock"
              className="block text-sm font-medium text-text-primary mb-1.5"
            >
              Low stock alert{" "}
              <span className="text-text-muted text-xs font-normal">
                (optional)
              </span>
            </label>
            <div className="relative">
              <input
                id="field-low-stock"
                type="text"
                inputMode="decimal"
                value={draft.lowStockAlert}
                onChange={(e) =>
                  updateDraft(
                    "lowStockAlert",
                    e.target.value.replace(/[^0-9]/g, ""),
                  )
                }
                placeholder="e.g., 20"
                aria-describedby="help-low-stock"
                className="w-full bg-surface-card border border-neutral-300 rounded-lg px-4 py-3 text-base min-h-[44px] focus:outline-none focus:ring-2 focus:ring-brand-500 transition-colors"
              />
              <span className="absolute right-4 top-3 text-text-secondary bg-surface-card">
                {draft.unit || "unit"}
              </span>
            </div>
            <p
              id="help-low-stock"
              className="text-xs text-text-secondary mt-1.5"
            >
              Jab stock isse neeche aaye, aapko notification milega
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-4 border-t border-neutral-100">
          {/* HSN Code */}
          <div>
            <label
              htmlFor="field-hsn"
              className="block text-sm font-medium text-text-primary mb-1.5"
            >
              HSN Code{" "}
              <span className="text-text-muted text-xs font-normal">
                (optional)
              </span>
            </label>
            <input
              id="field-hsn"
              type="text"
              value={draft.hsnCode}
              onChange={(e) => updateDraft("hsnCode", e.target.value)}
              placeholder="e.g., 6205"
              className="w-full bg-surface-card border border-neutral-300 rounded-lg px-4 py-3 text-base min-h-[44px] focus:outline-none focus:ring-2 focus:ring-brand-500 transition-colors"
            />
          </div>

          {/* MRP */}
          <div>
            <label
              htmlFor="field-mrp"
              className="block text-sm font-medium text-text-primary mb-1.5"
            >
              MRP (₹){" "}
              <span className="text-text-muted text-xs font-normal">
                (optional)
              </span>
            </label>
            <div className="relative">
              <span className="absolute left-4 top-3 text-text-secondary">
                ₹
              </span>
              <input
                id="field-mrp"
                type="text"
                inputMode="decimal"
                value={draft.mrp}
                onChange={(e) =>
                  updateDraft("mrp", e.target.value.replace(/[^0-9.]/g, ""))
                }
                className="w-full bg-surface-card border border-neutral-300 rounded-lg pl-8 pr-4 py-3 text-base min-h-[44px] focus:outline-none focus:ring-2 focus:ring-brand-500 transition-colors"
              />
            </div>
          </div>
        </div>
      </div>
    </fieldset>
  );
}
