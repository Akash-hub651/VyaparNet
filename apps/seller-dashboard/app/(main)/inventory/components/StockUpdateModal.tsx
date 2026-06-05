"use client";

import React, { useState, useEffect } from "react";
import Image from "next/image";
import {
  InventoryViewModel,
  updateSellerStock,
} from "../../../../lib/api/inventory.client";
import { FormModal } from "../../../../components/ui/Modal";
import { useAuth } from "../../../contexts/auth.context";
import { useToast } from "../../../../components/ui/Toast";

interface StockUpdateModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: InventoryViewModel | null;
  onSuccess: (updatedProduct: InventoryViewModel) => void;
}

type UpdateType = "add" | "set" | "remove";

export function StockUpdateModal({
  isOpen,
  onClose,
  product,
  onSuccess,
}: StockUpdateModalProps) {
  const [updateType, setUpdateType] = useState<UpdateType>("add");
  const [quantityStr, setQuantityStr] = useState("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const { accessToken } = useAuth();
  const { addToast } = useToast();

  // Reset form when modal opens with a new product
  useEffect(() => {
    if (isOpen && product) {
      setUpdateType("add");
      setQuantityStr("");
      setReason("");
      setNote("");
      setError("");
    }
  }, [isOpen, product]);

  if (!isOpen || !product) return null;

  const currentStock = product.quantity;
  const inputQty = Number(quantityStr) || 0;

  // Calculate live preview
  let newStock = currentStock;
  if (updateType === "add") {
    newStock = currentStock + inputQty;
  } else if (updateType === "remove") {
    newStock = currentStock - inputQty;
  } else if (updateType === "set") {
    newStock = inputQty;
  }

  const isInvalidStock = newStock < 0;

  const validate = () => {
    if (!quantityStr) {
      setError("Quantity likhna zaroori hai.");
      return false;
    }
    if (isInvalidStock) {
      setError("Stock 0 se kam nahi ho sakta.");
      return false;
    }
    if (updateType === "remove" && !reason) {
      setError("Remove karne ka reason select karein.");
      return false;
    }
    setError("");
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate() || !accessToken) return;

    setIsSubmitting(true);
    try {
      const res = await updateSellerStock(
        product.productId,
        {
          quantity: newStock,
          reason: reason || (updateType === "add" ? "Restock" : "Adjustment"),
          // Optional note would be appended to reason or sent separately if backend supported it.
          // Since DTO only has `reason`, we will just send reason.
        },
        accessToken,
      );

      if (res.error) {
        setError(res.error.message || "Update failed. Dobara try karein.");
      } else if (res.data) {
        addToast({ message: "Stock update ho gaya!", variant: "success" });

        // Compute the updated view model locally
        const updatedItem: InventoryViewModel = {
          ...product,
          quantity: newStock,
          isOutOfStock: newStock === 0,
          isLowStock: newStock > 0 && newStock <= product.lowStockThreshold,
          lastUpdated: new Date().toISOString(),
        };
        onSuccess(updatedItem);
        onClose();
      }
    } catch {
      setError("Network error. Update nahi ho paya.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <FormModal
      isOpen={isOpen}
      onClose={isSubmitting ? () => {} : onClose}
      title={`Stock Update — ${product.productName}`}
      size="sm"
    >
      <form onSubmit={handleSubmit} className="p-1">
        {/* Product Preview Box */}
        <div className="bg-neutral-50 rounded-lg p-3 flex items-center gap-3 mb-6 border border-neutral-200">
          <div className="w-10 h-10 rounded bg-white border border-neutral-200 overflow-hidden relative flex-shrink-0">
            {product.productImage ? (
              <Image
                src={product.productImage}
                alt="Product"
                fill
                className="object-cover"
                sizes="40px"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-neutral-400">
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.5"
                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-text-primary truncate">
              {product.productName}
            </p>
            <p className="text-xs text-text-muted font-mono truncate">
              {product.productSku}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-text-secondary">Current</p>
            <p className="text-sm font-semibold text-text-primary">
              {currentStock} {product.unit}
            </p>
          </div>
        </div>

        {error && (
          <div
            className="mb-4 bg-error-50 border-l-4 border-error-500 p-3 rounded-r-md"
            role="alert"
          >
            <p className="text-sm text-error-700">{error}</p>
          </div>
        )}

        <fieldset className="space-y-5">
          {/* Update Type Radios */}
          <div>
            <legend className="text-sm font-medium text-text-primary mb-2">
              Action
            </legend>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <label
                className={`flex items-center gap-2 p-3 border rounded-lg cursor-pointer transition-colors ${updateType === "add" ? "border-brand-500 bg-brand-50" : "border-neutral-200 hover:bg-neutral-50"}`}
              >
                <input
                  type="radio"
                  name="updateType"
                  value="add"
                  checked={updateType === "add"}
                  onChange={() => setUpdateType("add")}
                  className="text-brand-600 focus:ring-brand-500"
                />
                <span className="text-sm font-medium text-text-primary leading-tight">
                  Add
                  <br />
                  <span className="text-xs text-text-muted font-normal">
                    stock mein add
                  </span>
                </span>
              </label>
              <label
                className={`flex items-center gap-2 p-3 border rounded-lg cursor-pointer transition-colors ${updateType === "set" ? "border-brand-500 bg-brand-50" : "border-neutral-200 hover:bg-neutral-50"}`}
              >
                <input
                  type="radio"
                  name="updateType"
                  value="set"
                  checked={updateType === "set"}
                  onChange={() => setUpdateType("set")}
                  className="text-brand-600 focus:ring-brand-500"
                />
                <span className="text-sm font-medium text-text-primary leading-tight">
                  Set
                  <br />
                  <span className="text-xs text-text-muted font-normal">
                    exact quantity set
                  </span>
                </span>
              </label>
              <label
                className={`flex items-center gap-2 p-3 border rounded-lg cursor-pointer transition-colors ${updateType === "remove" ? "border-error-500 bg-error-50" : "border-neutral-200 hover:bg-neutral-50"}`}
              >
                <input
                  type="radio"
                  name="updateType"
                  value="remove"
                  checked={updateType === "remove"}
                  onChange={() => setUpdateType("remove")}
                  className="text-error-600 focus:ring-error-500"
                />
                <span className="text-sm font-medium text-text-primary leading-tight">
                  Remove
                  <br />
                  <span className="text-xs text-text-muted font-normal">
                    stock se nikaalein
                  </span>
                </span>
              </label>
            </div>
          </div>

          <div className="flex flex-col items-center justify-center mb-6">
            <label
              htmlFor="qty-input"
              className="block text-sm font-medium text-text-primary mb-3"
            >
              Quantity{" "}
              {updateType === "remove" && (
                <span className="text-error-500">*</span>
              )}
            </label>
            <div className="relative w-full max-w-[200px]">
              <span className="absolute left-4 top-4 font-mono text-xl text-text-secondary select-none">
                {updateType === "add"
                  ? "+"
                  : updateType === "remove"
                    ? "-"
                    : "="}
              </span>
              <input
                id="qty-input"
                type="text"
                inputMode="decimal"
                value={quantityStr}
                onChange={(e) =>
                  setQuantityStr(e.target.value.replace(/[^0-9]/g, ""))
                }
                placeholder="0"
                className="w-full bg-surface-card border border-neutral-300 rounded-xl h-14 text-center text-2xl font-bold focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <span className="mt-2 text-sm text-text-secondary">
              {product.unit}
            </span>

            {/* Live Preview (Centered below unit) */}
            <div
              className={`mt-3 px-4 py-2 border rounded-full font-medium text-sm flex items-center gap-2 ${isInvalidStock ? "bg-error-50 border-error-200 text-error-700" : newStock > currentStock ? "bg-success-50 border-success-200 text-success-800" : newStock < currentStock ? "bg-warning-50 border-warning-200 text-warning-800" : "bg-neutral-50 border-neutral-200 text-neutral-700"}`}
              aria-live="polite"
            >
              <span>{currentStock}</span>
              <span>→</span>
              <span>
                {newStock} {product.unit}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {/* Reason (Conditional) */}
            {updateType === "remove" && (
              <div>
                <label
                  htmlFor="reason-select"
                  className="block text-sm font-medium text-text-primary mb-1.5"
                >
                  Reason <span className="text-error-500">*</span>
                </label>
                <select
                  id="reason-select"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full bg-surface-card border border-neutral-300 rounded-lg px-4 py-3 text-base min-h-[44px] focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="">Select reason</option>
                  <option value="Sale/Dispatch">Sale/Dispatch</option>
                  <option value="Damage/Loss">Damage/Loss</option>
                  <option value="Return">Return (Restock)</option>
                  <option value="Manual Correction">Manual Correction</option>
                  <option value="Adjustment">Adjustment</option>
                </select>
              </div>
            )}

            {/* Note */}
            <div>
              <label
                htmlFor="note-input"
                className="block text-sm font-medium text-text-primary mb-1.5"
              >
                Note{" "}
                <span className="text-xs text-text-muted font-normal">
                  (optional)
                </span>
              </label>
              <textarea
                id="note-input"
                value={note}
                onChange={(e) => setNote(e.target.value.slice(0, 200))}
                placeholder="Internal note (buyers ko nahi dikhega)"
                rows={2}
                className="w-full bg-surface-card border border-neutral-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
              />
              <div className="text-right mt-1">
                <span className="text-xs text-text-muted">
                  {note.length}/200
                </span>
              </div>
            </div>
          </div>
        </fieldset>

        {/* Actions */}
        <div className="mt-8 flex flex-col sm:flex-row justify-end gap-3 pt-4 border-t border-neutral-100">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-3 sm:py-2.5 text-sm font-semibold text-text-secondary hover:bg-neutral-50 border border-transparent rounded-lg transition-colors min-h-[48px] sm:min-h-[44px] w-full sm:w-auto order-2 sm:order-1"
          >
            Baad Mein
          </button>
          <button
            type="submit"
            disabled={isSubmitting || isInvalidStock}
            className={`px-6 py-3 sm:py-2.5 text-sm font-semibold text-white rounded-lg transition-colors min-h-[48px] sm:min-h-[44px] w-full sm:w-auto order-1 sm:order-2 ${isInvalidStock || isSubmitting ? "bg-brand-400 cursor-not-allowed" : "bg-brand-600 hover:bg-brand-700"}`}
          >
            {isSubmitting ? "Saving..." : "Stock Update Karein"}
          </button>
        </div>
      </form>
    </FormModal>
  );
}
