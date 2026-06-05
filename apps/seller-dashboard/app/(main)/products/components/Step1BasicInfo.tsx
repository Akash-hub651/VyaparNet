"use client";

import React from "react";
import { DraftData } from "./types";
import {
  CategoryResponse,
  SegmentAttributeSchemaDef,
  AttributePropertyDef,
} from "../../../../lib/api/categories.client";

interface Step1Props {
  draft: DraftData;
  categories: CategoryResponse[];
  segmentSchema: SegmentAttributeSchemaDef | null;
  schemaLoading: boolean;
  errors: Record<string, string>;
  updateDraft: (key: keyof DraftData, value: string) => void;
  updateSegmentAttr: (key: string, value: string) => void;
  handleCategoryChange: (categoryId: string) => void;
}

export function Step1BasicInfo({
  draft,
  categories,
  segmentSchema,
  schemaLoading,
  errors,
  updateDraft,
  updateSegmentAttr,
  handleCategoryChange,
}: Step1Props): React.JSX.Element {
  return (
    <fieldset className="space-y-6">
      <legend className="sr-only">Step 1: Basic Information</legend>
      <div className="space-y-5">
        {/* Product name */}
        <div>
          <label
            htmlFor="field-name"
            className="block text-sm font-medium text-text-primary mb-1.5"
          >
            Product ka naam{" "}
            <span className="text-error-500" aria-hidden="true">
              *
            </span>
          </label>
          <div className="relative">
            <input
              id="field-name"
              type="text"
              value={draft.name}
              onChange={(e) => updateDraft("name", e.target.value)}
              placeholder="e.g., Premium Cotton Kurti — 2.5m"
              maxLength={100}
              aria-required="true"
              aria-invalid={!!errors["name"]}
              aria-describedby={errors["name"] ? "error-name" : undefined}
              className={`w-full bg-surface-card border rounded-lg px-4 py-3 text-base min-h-[44px] focus:outline-none focus:ring-2 focus:ring-brand-500 transition-colors ${
                errors["name"] ? "border-error-500" : "border-neutral-300"
              }`}
            />
            {draft.name.length > 80 && (
              <span className="absolute right-3 top-3.5 text-xs text-text-secondary bg-surface-card px-1">
                {draft.name.length}/100
              </span>
            )}
          </div>
          {errors["name"] && (
            <p
              id="error-name"
              className="text-xs text-error-600 mt-1.5"
              role="alert"
            >
              {errors["name"]}
            </p>
          )}
        </div>

        {/* Category */}
        <div>
          <label
            htmlFor="field-category"
            className="block text-sm font-medium text-text-primary mb-1.5"
          >
            Product ka segment{" "}
            <span className="text-error-500" aria-hidden="true">
              *
            </span>
          </label>
          <select
            id="field-category"
            value={draft.categoryId}
            onChange={(e) => handleCategoryChange(e.target.value)}
            aria-required="true"
            aria-invalid={!!errors["categoryId"]}
            aria-describedby={
              errors["categoryId"] ? "error-category" : undefined
            }
            className={`w-full bg-surface-card border rounded-lg px-4 py-3 text-base min-h-[44px] focus:outline-none focus:ring-2 focus:ring-brand-500 transition-colors ${
              errors["categoryId"] ? "border-error-500" : "border-neutral-300"
            }`}
          >
            <option value="">Select a segment...</option>
            {categories.map((cat) => (
              <optgroup key={cat.id} label={`${cat.name} (${cat.segment})`}>
                {(!cat.children || cat.children.length === 0) && (
                  <option value={cat.id}>{cat.name}</option>
                )}
                {cat.children?.map((sub) => (
                  <option key={sub.id} value={sub.id}>
                    {sub.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          {errors["categoryId"] && (
            <p
              id="error-category"
              className="text-xs text-error-600 mt-1.5"
              role="alert"
            >
              {errors["categoryId"]}
            </p>
          )}
        </div>

        {/* Description */}
        <div>
          <label
            htmlFor="field-description"
            className="block text-sm font-medium text-text-primary mb-1.5"
          >
            Product ki details{" "}
            <span className="text-error-500" aria-hidden="true">
              *
            </span>
          </label>
          <div className="relative">
            <textarea
              id="field-description"
              value={draft.description}
              onChange={(e) => updateDraft("description", e.target.value)}
              rows={4}
              maxLength={1000}
              aria-required="true"
              aria-invalid={!!errors["description"]}
              aria-describedby={
                errors["description"] ? "error-description" : "help-description"
              }
              placeholder="Material, size, quality, use case — buyers yahi padhke decide karte hain"
              className={`w-full bg-surface-card border rounded-lg px-4 py-3 text-base resize-none focus:outline-none focus:ring-2 focus:ring-brand-500 transition-colors ${
                errors["description"]
                  ? "border-error-500"
                  : "border-neutral-300"
              }`}
            />
            <span className="absolute right-3 bottom-3 text-xs text-text-secondary bg-surface-card/80 px-1 backdrop-blur-sm">
              {draft.description.length}/1000
            </span>
          </div>
          <p
            id="help-description"
            className="text-xs text-text-secondary mt-1.5"
          >
            Acchi description se orders zyada aate hain. (Min: 50 characters)
          </p>
          {errors["description"] && (
            <p
              id="error-description"
              className="text-xs text-error-600 mt-1.5"
              role="alert"
            >
              {errors["description"]}
            </p>
          )}
        </div>

        {/* ── Dynamic Segment Attribute Fields ────────────── */}
        {schemaLoading && (
          <div
            className="flex items-center gap-2 text-sm text-text-secondary"
            aria-live="polite"
            aria-busy="true"
          >
            <svg
              className="animate-spin w-5 h-5 text-brand-600"
              viewBox="0 0 24 24"
              fill="none"
            >
              <circle
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="3"
                opacity="0.2"
              />
              <path
                d="M22 12a10 10 0 01-10 10"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
              />
            </svg>
            Loading attributes...
          </div>
        )}

        {!schemaLoading && segmentSchema && (
          <fieldset className="border-t border-neutral-200 pt-5 mt-2">
            <legend className="text-sm font-semibold text-text-primary mb-4 flex items-center gap-2 w-full">
              Segment Attributes
              <span className="text-xs font-normal text-text-secondary bg-neutral-100 border border-neutral-200 px-2 py-0.5 rounded-full">
                from schema
              </span>
            </legend>
            <div className="space-y-5">
              {/* Required attributes first */}
              {segmentSchema.required.map((key) => {
                const prop = segmentSchema.properties[key];
                if (!prop) return null;
                return (
                  <SegmentAttrField
                    key={key}
                    attrKey={key}
                    prop={prop}
                    required
                    value={draft.segmentAttributes[key] ?? ""}
                    onChange={(v) => updateSegmentAttr(key, v)}
                    error={errors[`attr_${key}`]}
                  />
                );
              })}
              {/* Optional attributes */}
              {segmentSchema.optional.map((key) => {
                const prop = segmentSchema.properties[key];
                if (!prop) return null;
                return (
                  <SegmentAttrField
                    key={key}
                    attrKey={key}
                    prop={prop}
                    required={false}
                    value={draft.segmentAttributes[key] ?? ""}
                    onChange={(v) => updateSegmentAttr(key, v)}
                  />
                );
              })}
            </div>
          </fieldset>
        )}
      </div>
    </fieldset>
  );
}

// ─────────────────────────────────────────────────────────────
// Dynamic Field Renderer
// ─────────────────────────────────────────────────────────────
function SegmentAttrField({
  attrKey,
  prop,
  required,
  value,
  onChange,
  error,
}: {
  attrKey: string;
  prop: AttributePropertyDef;
  required: boolean;
  value: string;
  onChange: (v: string) => void;
  error?: string;
}) {
  const inputId = `attr-${attrKey}`;

  return (
    <div>
      <label
        htmlFor={inputId}
        className="block text-sm font-medium text-text-primary mb-1.5"
      >
        {prop.label}{" "}
        {required && (
          <span className="text-error-500" aria-hidden="true">
            *
          </span>
        )}
      </label>

      {prop.type === "enum" && prop.options ? (
        <select
          id={inputId}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-required={required}
          aria-invalid={!!error}
          className={`w-full bg-surface-card border rounded-lg px-4 py-3 text-base min-h-[44px] focus:outline-none focus:ring-2 focus:ring-brand-500 transition-colors ${
            error ? "border-error-500" : "border-neutral-300"
          }`}
        >
          <option value="">Select...</option>
          {prop.options.map((opt: string) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      ) : prop.type === "boolean" ? (
        <div className="flex items-center gap-3 min-h-[44px]">
          <input
            id={inputId}
            type="checkbox"
            checked={value === "true"}
            onChange={(e) => onChange(e.target.checked ? "true" : "false")}
            className="w-5 h-5 rounded border-neutral-300 text-brand-600 focus:ring-brand-500"
          />
          <span className="text-sm text-text-primary">Yes / Enable</span>
        </div>
      ) : (
        <input
          id={inputId}
          type={prop.type === "number" ? "text" : "text"}
          inputMode={prop.type === "number" ? "decimal" : "text"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={`Enter ${prop.label.toLowerCase()}`}
          aria-required={required}
          aria-invalid={!!error}
          className={`w-full bg-surface-card border rounded-lg px-4 py-3 text-base min-h-[44px] focus:outline-none focus:ring-2 focus:ring-brand-500 transition-colors ${
            error ? "border-error-500" : "border-neutral-300"
          }`}
        />
      )}

      {error && (
        <p className="text-xs text-error-600 mt-1.5" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
