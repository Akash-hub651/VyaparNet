'use client';

/**
 * Seller Product Create — apps/seller-dashboard/app/(main)/products/new/page.tsx
 *
 * Authority: SPRINT2_IMPLEMENTATION_LOCKED_final_v2.0.md Section 9.5
 *
 * 3-step wizard:
 *   Step 1: Basic Info (name, category, description, tags)
 *           After category selected → fetch SegmentAttributeSchema → render dynamic fields
 *           ZERO hardcoded if (segment === 'TEXTILE') attribute logic
 *   Step 2: Pricing (basePrice, mrp, moq, unit, hsnCode, gstPercent)
 *   Step 3: Images (drag-drop → POST /media/upload per file, progress bar, thumbnail preview)
 *
 * localStorage draft autosave after each step.
 * "Draft mila. Wapas karna chahte hain?" restore prompt on revisit.
 *
 * Submit → POST /api/v1/products (DRAFT)
 * Publish → POST /api/v1/products/:id/publish
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../../contexts/auth.context';
import { getCategories, getSegmentAttributeSchema, type CategoryResponse, type SegmentAttributeSchemaDef } from '../../../../lib/api/categories.client';
import { createProduct, publishProduct, type ProductResponse } from '../../../../lib/api/products.client';
import { getApiBaseUrl } from '../../../../lib/config';

const DRAFT_KEY = 'vyaparnet_seller_product_draft';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface UploadedMedia {
  mediaId: string;
  url: string;
  mediaClass: 'PRODUCT_IMAGE' | 'SWATCH';
  name: string;
}

interface DraftData {
  step: number;
  name: string;
  categoryId: string;
  description: string;
  tags: string;
  segmentAttributes: Record<string, string>;
  basePrice: string;
  mrp: string;
  moq: string;
  unit: string;
  hsnCode: string;
  gstPercent: string;
  mediaIds: string[];
}

const EMPTY_DRAFT: DraftData = {
  step: 1,
  name: '',
  categoryId: '',
  description: '',
  tags: '',
  segmentAttributes: {},
  basePrice: '',
  mrp: '',
  moq: '1',
  unit: 'piece',
  hsnCode: '',
  gstPercent: '',
  mediaIds: [],
};

// ─────────────────────────────────────────────────────────────
// Step indicator
// ─────────────────────────────────────────────────────────────

function StepIndicator({ current }: { current: number }): React.JSX.Element {
  const steps = [
    { n: 1, label: 'Basic Info' },
    { n: 2, label: 'Pricing' },
    { n: 3, label: 'Images' },
  ];
  return (
    <div className="flex items-center justify-center gap-0 mb-8" aria-label="Form steps">
      {steps.map((step, i) => (
        <React.Fragment key={step.n}>
          <div className="flex flex-col items-center gap-1.5">
            <div
              className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm transition-all ${
                current > step.n
                  ? 'bg-[#10B981] text-white'
                  : current === step.n
                  ? 'bg-[#2563EB] text-white ring-4 ring-[#EFF6FF]'
                  : 'bg-[#F1F5F9] text-[#94A3B8]'
              }`}
              aria-current={current === step.n ? 'step' : undefined}
            >
              {current > step.n ? '✓' : step.n}
            </div>
            <span className={`text-xs font-medium ${current === step.n ? 'text-[#2563EB]' : 'text-[#94A3B8]'}`}>
              {step.label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div
              className={`h-0.5 w-20 mt-[-14px] transition-all ${current > step.n ? 'bg-[#10B981]' : 'bg-[#E2E8F0]'}`}
              aria-hidden="true"
            />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────

export default function SellerProductNewPage(): React.JSX.Element {
  const { accessToken } = useAuth();
  const router = useRouter();

  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState<DraftData>(EMPTY_DRAFT);
  const [showRestorePrompt, setShowRestorePrompt] = useState(false);
  const [categories, setCategories] = useState<CategoryResponse[]>([]);
  const [segmentSchema, setSegmentSchema] = useState<SegmentAttributeSchemaDef | null>(null);
  const [schemaLoading, setSchemaLoading] = useState(false);
  const [uploadedMedia, setUploadedMedia] = useState<UploadedMedia[]>([]);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdProduct, setCreatedProduct] = useState<ProductResponse | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Restore draft prompt ────────────────────────────────────
  useEffect(() => {
    const saved = localStorage.getItem(DRAFT_KEY);
    if (saved) {
      setShowRestorePrompt(true);
    }
  }, []);

  const restoreDraft = (): void => {
    const saved = localStorage.getItem(DRAFT_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as DraftData;
      setDraft(parsed);
      setStep(parsed.step);
    }
    setShowRestorePrompt(false);
  };

  const discardDraft = (): void => {
    localStorage.removeItem(DRAFT_KEY);
    setShowRestorePrompt(false);
  };

  // ── Autosave after each field change ───────────────────────
  useEffect(() => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...draft, step }));
  }, [draft, step]);

  // ── Load categories ─────────────────────────────────────────
  useEffect(() => {
    void getCategories(undefined, accessToken).then((res) => {
      if (res.data) setCategories(res.data);
    });
  }, [accessToken]);

  // ── Fetch SegmentAttributeSchema when category changes ──────
  const handleCategoryChange = useCallback(async (categoryId: string): Promise<void> => {
    setDraft((d) => ({ ...d, categoryId, segmentAttributes: {} }));
    if (!categoryId) {
      setSegmentSchema(null);
      return;
    }

    // Determine segment from chosen category
    const allCats: CategoryResponse[] = categories;
    function findCat(cats: CategoryResponse[], id: string): CategoryResponse | undefined {
      for (const c of cats) {
        if (c.id === id) return c;
        if (c.children) {
          const found = findCat(c.children, id);
          if (found) return found;
        }
      }
      return undefined;
    }
    const cat = findCat(allCats, categoryId);
    if (!cat) return;

    setSchemaLoading(true);
    const res = await getSegmentAttributeSchema(cat.segment, accessToken);
    if (res.data) {
      setSegmentSchema(res.data.schema as SegmentAttributeSchemaDef);
    }
    setSchemaLoading(false);
  }, [categories, accessToken]);

  // ── Field updater ───────────────────────────────────────────
  const updateDraft = (key: keyof DraftData, value: string): void => {
    setDraft((d) => ({ ...d, [key]: value }));
    setErrors((e) => {
      const copy = { ...e };
      delete copy[key];
      return copy;
    });
  };

  const updateSegmentAttr = (key: string, value: string): void => {
    setDraft((d) => ({
      ...d,
      segmentAttributes: { ...d.segmentAttributes, [key]: value },
    }));
  };

  // ── Validation ──────────────────────────────────────────────
  const validateStep1 = (): boolean => {
    const errs: Record<string, string> = {};
    if (!draft.name.trim() || draft.name.trim().length < 3) {
      errs['name'] = 'Product name must be at least 3 characters';
    }
    if (!draft.categoryId) {
      errs['categoryId'] = 'Please select a category';
    }
    // Validate required segment attributes
    if (segmentSchema) {
      for (const reqKey of segmentSchema.required) {
        if (!draft.segmentAttributes[reqKey]) {
          errs[`attr_${reqKey}`] = `${segmentSchema.properties[reqKey]?.label ?? reqKey} is required`;
        }
      }
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const validateStep2 = (): boolean => {
    const errs: Record<string, string> = {};
    if (!draft.basePrice || Number(draft.basePrice) <= 0) {
      errs['basePrice'] = 'Base price must be a positive number';
    }
    if (!draft.unit.trim()) {
      errs['unit'] = 'Unit is required (e.g. piece, kg, meter)';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // ── Navigation ──────────────────────────────────────────────
  const goNext = (): void => {
    if (step === 1 && !validateStep1()) return;
    if (step === 2 && !validateStep2()) return;
    setStep((s) => Math.min(s + 1, 3));
  };

  const goBack = (): void => setStep((s) => Math.max(s - 1, 1));

  // ── Image upload ────────────────────────────────────────────
  const handleFileSelect = async (files: FileList): Promise<void> => {
    if (!accessToken) return;
    const apiBase = getApiBaseUrl();

    for (const file of Array.from(files)) {
      const tempId = `${file.name}-${Date.now()}`;
      setUploadProgress((p) => ({ ...p, [tempId]: 0 }));

      const formData = new FormData();
      formData.append('file', file);
      formData.append('mediaClass', 'PRODUCT_IMAGE');

      try {
        // Use XHR for progress tracking
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open('POST', `${apiBase}/api/v1/media/upload`);
          xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);

          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
              setUploadProgress((p) => ({ ...p, [tempId]: Math.round((e.loaded / e.total) * 100) }));
            }
          };

          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              const data = JSON.parse(xhr.responseText) as {
                success: boolean;
                data: { id: string; url: string };
              };
              if (data.success) {
                const { id: mediaId, url } = data.data;
                setUploadedMedia((prev) => [
                  ...prev,
                  { mediaId, url, mediaClass: 'PRODUCT_IMAGE', name: file.name },
                ]);
                setDraft((d) => ({ ...d, mediaIds: [...d.mediaIds, mediaId] }));
              }
              setUploadProgress((p) => {
                const copy = { ...p };
                delete copy[tempId];
                return copy;
              });
              resolve();
            } else {
              reject(new Error(`Upload failed: ${xhr.statusText}`));
            }
          };

          xhr.onerror = () => reject(new Error('Network error during upload'));
          xhr.send(formData);
        });
      } catch (err) {
        console.error('Upload error:', err);
        setUploadProgress((p) => {
          const copy = { ...p };
          delete copy[tempId];
          return copy;
        });
      }
    }
  };

  const handleDrop = (e: React.DragEvent): void => {
    e.preventDefault();
    if (e.dataTransfer.files.length > 0) {
      void handleFileSelect(e.dataTransfer.files);
    }
  };

  const removeMedia = (mediaId: string): void => {
    setUploadedMedia((prev) => prev.filter((m) => m.mediaId !== mediaId));
    setDraft((d) => ({ ...d, mediaIds: d.mediaIds.filter((id) => id !== mediaId) }));
  };

  const setMediaClass = (mediaId: string, mediaClass: 'PRODUCT_IMAGE' | 'SWATCH'): void => {
    setUploadedMedia((prev) =>
      prev.map((m) => (m.mediaId === mediaId ? { ...m, mediaClass } : m))
    );
  };

  // ── Submit (create DRAFT) ────────────────────────────────────
  const handleSubmit = async (): Promise<void> => {
    if (!accessToken) return;
    setIsSubmitting(true);

    const res = await createProduct(
      {
        name: draft.name.trim(),
        description: draft.description.trim() || undefined,
        basePrice: Number(draft.basePrice),
        mrp: draft.mrp ? Number(draft.mrp) : undefined,
        moq: draft.moq ? Number(draft.moq) : 1,
        unit: draft.unit.trim(),
        categoryId: draft.categoryId,
        hsnCode: draft.hsnCode.trim() || undefined,
        gstPercent: draft.gstPercent ? Number(draft.gstPercent) : undefined,
        tags: draft.tags ? draft.tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
        mediaIds: draft.mediaIds,
        segmentAttributes: Object.fromEntries(
          Object.entries(draft.segmentAttributes).filter(([, v]) => v !== ''),
        ),
      },
      accessToken,
    );

    setIsSubmitting(false);

    if (res.error) {
      alert(`Failed to create product: ${res.error.message}`);
      return;
    }

    localStorage.removeItem(DRAFT_KEY);
    setCreatedProduct(res.data);
  };

  // ── Publish ──────────────────────────────────────────────────
  const handlePublish = async (): Promise<void> => {
    if (!accessToken || !createdProduct) return;
    setIsSubmitting(true);
    const res = await publishProduct(createdProduct.id, accessToken);
    setIsSubmitting(false);
    if (res.error) {
      alert(`Publish failed: ${res.error.message}`);
      return;
    }
    router.push('/products');
  };

  // ─────────────────────────────────────────────────────────────
  // Success state (draft created)
  // ─────────────────────────────────────────────────────────────
  if (createdProduct) {
    return (
      <div className="max-w-lg mx-auto text-center py-16">
        <div className="text-5xl mb-4">🎉</div>
        <h1 className="text-xl font-bold text-[#1E293B] mb-2">Product Draft Created!</h1>
        <p className="text-[#64748B] text-sm mb-6">
          <strong>{createdProduct.name}</strong> has been saved as a draft.
          You can publish it now or review it first.
        </p>
        <div className="flex gap-3 justify-center">
          <button
            id="success-publish-btn"
            onClick={() => void handlePublish()}
            disabled={isSubmitting}
            className="bg-[#10B981] text-white font-semibold px-6 py-2.5 rounded-lg hover:bg-[#059669] transition-colors disabled:opacity-50"
          >
            {isSubmitting ? 'Publishing…' : 'Publish Now'}
          </button>
          <button
            id="success-go-products-btn"
            onClick={() => router.push('/products')}
            className="border border-[#E2E8F0] text-[#1E293B] font-medium px-6 py-2.5 rounded-lg hover:bg-[#F8FAFC] transition-colors"
          >
            View Products
          </button>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────
  // Draft restore prompt
  // ─────────────────────────────────────────────────────────────
  return (
    <div className="max-w-2xl mx-auto">
      {/* Page heading */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-[#1E293B]">Add New Product</h1>
        <p className="text-sm text-[#64748B] mt-1">
          Fill in product details across 3 simple steps.
        </p>
      </div>

      {/* Draft restore prompt */}
      {showRestorePrompt && (
        <div
          id="draft-restore-prompt"
          className="bg-[#FEF3C7] border border-[#FCD34D] rounded-lg px-4 py-3 mb-6 flex items-center justify-between gap-4"
          role="alert"
        >
          <p className="text-sm text-[#92400E] font-medium">
            📝 Draft mila. Wapas karna chahte hain?
          </p>
          <div className="flex gap-2 flex-shrink-0">
            <button
              id="draft-restore-yes"
              onClick={restoreDraft}
              className="text-xs bg-[#92400E] text-white px-3 py-1.5 rounded font-medium hover:bg-[#78350F] transition-colors"
            >
              Haan, restore karo
            </button>
            <button
              id="draft-restore-no"
              onClick={discardDraft}
              className="text-xs text-[#92400E] border border-[#FCD34D] px-3 py-1.5 rounded font-medium hover:bg-[#FEF9C3] transition-colors"
            >
              Naya banao
            </button>
          </div>
        </div>
      )}

      {/* Step indicator */}
      <StepIndicator current={step} />

      {/* ── Form card ── */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] p-6 shadow-sm">

        {/* ── Step 1: Basic Info ─────────────────────────── */}
        {step === 1 && (
          <div className="space-y-5">
            <h2 className="text-base font-semibold text-[#1E293B]">Basic Information</h2>

            {/* Product name */}
            <div>
              <label htmlFor="field-name" className="block text-sm font-medium text-[#1E293B] mb-1.5">
                Product Name <span className="text-[#EF4444]">*</span>
              </label>
              <input
                id="field-name"
                type="text"
                value={draft.name}
                onChange={(e) => updateDraft('name', e.target.value)}
                placeholder="e.g. Cotton Kurti Set — Block Print"
                className={`w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB] ${errors['name'] ? 'border-[#EF4444]' : 'border-[#E2E8F0]'}`}
                maxLength={255}
              />
              {errors['name'] && <p className="text-xs text-[#EF4444] mt-1">{errors['name']}</p>}
            </div>

            {/* Category */}
            <div>
              <label htmlFor="field-category" className="block text-sm font-medium text-[#1E293B] mb-1.5">
                Category <span className="text-[#EF4444]">*</span>
              </label>
              <select
                id="field-category"
                value={draft.categoryId}
                onChange={(e) => void handleCategoryChange(e.target.value)}
                className={`w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB] bg-white ${errors['categoryId'] ? 'border-[#EF4444]' : 'border-[#E2E8F0]'}`}
              >
                <option value="">Select a category…</option>
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
              {errors['categoryId'] && <p className="text-xs text-[#EF4444] mt-1">{errors['categoryId']}</p>}
            </div>

            {/* Description */}
            <div>
              <label htmlFor="field-description" className="block text-sm font-medium text-[#1E293B] mb-1.5">
                Description
              </label>
              <textarea
                id="field-description"
                value={draft.description}
                onChange={(e) => updateDraft('description', e.target.value)}
                rows={3}
                placeholder="Detailed product description…"
                className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
              />
            </div>

            {/* Tags */}
            <div>
              <label htmlFor="field-tags" className="block text-sm font-medium text-[#1E293B] mb-1.5">
                Tags <span className="text-xs text-[#94A3B8]">(comma-separated)</span>
              </label>
              <input
                id="field-tags"
                type="text"
                value={draft.tags}
                onChange={(e) => updateDraft('tags', e.target.value)}
                placeholder="e.g. cotton, kurti, block print"
                className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
              />
            </div>

            {/* ── Dynamic Segment Attribute Fields ──────────────
                Rendered from SegmentAttributeSchema.schema.
                This renders TEXTILE fields OR SPARE_PARTS fields WITHOUT
                any hardcoded if (segment === 'TEXTILE') logic.
                Adding a new segment requires ZERO code changes here.
            ── */}
            {schemaLoading && (
              <div className="flex items-center gap-2 text-sm text-[#64748B]">
                <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" opacity="0.25" />
                  <path d="M22 12a10 10 0 01-10 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
                Loading segment fields…
              </div>
            )}

            {!schemaLoading && segmentSchema && (
              <div className="border-t border-[#E2E8F0] pt-4">
                <h3 className="text-sm font-semibold text-[#1E293B] mb-3 flex items-center gap-2">
                  Segment Attributes
                  <span className="text-xs font-normal text-[#94A3B8] bg-[#F8FAFC] border border-[#E2E8F0] px-2 py-0.5 rounded-full">
                    from schema
                  </span>
                </h3>
                <div className="space-y-4">
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
                        value={draft.segmentAttributes[key] ?? ''}
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
                        value={draft.segmentAttributes[key] ?? ''}
                        onChange={(v) => updateSegmentAttr(key, v)}
                      />
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Step 2: Pricing ───────────────────────────────── */}
        {step === 2 && (
          <div className="space-y-5">
            <h2 className="text-base font-semibold text-[#1E293B]">Pricing & Details</h2>

            <div className="grid grid-cols-2 gap-4">
              {/* Base Price */}
              <div>
                <label htmlFor="field-baseprice" className="block text-sm font-medium text-[#1E293B] mb-1.5">
                  Base Price (₹) <span className="text-[#EF4444]">*</span>
                </label>
                <input
                  id="field-baseprice"
                  type="number"
                  min={0}
                  step="0.01"
                  value={draft.basePrice}
                  onChange={(e) => updateDraft('basePrice', e.target.value)}
                  className={`w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB] ${errors['basePrice'] ? 'border-[#EF4444]' : 'border-[#E2E8F0]'}`}
                />
                {errors['basePrice'] && <p className="text-xs text-[#EF4444] mt-1">{errors['basePrice']}</p>}
              </div>

              {/* MRP */}
              <div>
                <label htmlFor="field-mrp" className="block text-sm font-medium text-[#1E293B] mb-1.5">
                  MRP (₹) <span className="text-xs text-[#94A3B8]">optional</span>
                </label>
                <input
                  id="field-mrp"
                  type="number"
                  min={0}
                  step="0.01"
                  value={draft.mrp}
                  onChange={(e) => updateDraft('mrp', e.target.value)}
                  className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                />
              </div>

              {/* MOQ */}
              <div>
                <label htmlFor="field-moq" className="block text-sm font-medium text-[#1E293B] mb-1.5">
                  Min. Order Qty
                </label>
                <input
                  id="field-moq"
                  type="number"
                  min={1}
                  value={draft.moq}
                  onChange={(e) => updateDraft('moq', e.target.value)}
                  className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                />
              </div>

              {/* Unit */}
              <div>
                <label htmlFor="field-unit" className="block text-sm font-medium text-[#1E293B] mb-1.5">
                  Unit <span className="text-[#EF4444]">*</span>
                </label>
                <input
                  id="field-unit"
                  type="text"
                  value={draft.unit}
                  onChange={(e) => updateDraft('unit', e.target.value)}
                  placeholder="piece, kg, meter, set…"
                  className={`w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB] ${errors['unit'] ? 'border-[#EF4444]' : 'border-[#E2E8F0]'}`}
                />
                {errors['unit'] && <p className="text-xs text-[#EF4444] mt-1">{errors['unit']}</p>}
              </div>

              {/* HSN Code */}
              <div>
                <label htmlFor="field-hsn" className="block text-sm font-medium text-[#1E293B] mb-1.5">
                  HSN Code <span className="text-xs text-[#94A3B8]">optional</span>
                </label>
                <input
                  id="field-hsn"
                  type="text"
                  value={draft.hsnCode}
                  onChange={(e) => updateDraft('hsnCode', e.target.value)}
                  placeholder="e.g. 6205"
                  className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                />
              </div>

              {/* GST % */}
              <div>
                <label htmlFor="field-gst" className="block text-sm font-medium text-[#1E293B] mb-1.5">
                  GST % <span className="text-xs text-[#94A3B8]">optional</span>
                </label>
                <select
                  id="field-gst"
                  value={draft.gstPercent}
                  onChange={(e) => updateDraft('gstPercent', e.target.value)}
                  className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB] bg-white"
                >
                  <option value="">Select GST rate</option>
                  {[0, 5, 12, 18, 28].map((r) => (
                    <option key={r} value={r}>{r}%</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}

        {/* ── Step 3: Images ────────────────────────────────── */}
        {step === 3 && (
          <div className="space-y-5">
            <h2 className="text-base font-semibold text-[#1E293B]">Product Images</h2>
            <p className="text-sm text-[#64748B]">
              Upload product photos. At least one <strong>Product Image</strong> is required.
            </p>

            {/* Drop zone */}
            <div
              id="image-dropzone"
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-[#E2E8F0] rounded-xl p-10 text-center cursor-pointer hover:border-[#2563EB] hover:bg-[#EFF6FF] transition-all"
            >
              <div className="text-3xl mb-2">📷</div>
              <p className="text-sm font-medium text-[#1E293B]">
                Drag & drop images here
              </p>
              <p className="text-xs text-[#94A3B8] mt-1">
                or click to browse — JPG, PNG, WebP • Max 10MB each
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) void handleFileSelect(e.target.files);
                }}
              />
            </div>

            {/* Upload progress indicators */}
            {Object.entries(uploadProgress).map(([tempId, pct]) => (
              <div key={tempId} className="flex items-center gap-3">
                <div className="flex-1 bg-[#F1F5F9] rounded-full h-1.5 overflow-hidden">
                  <div
                    className="h-full bg-[#2563EB] transition-all duration-200"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="text-xs text-[#64748B] flex-shrink-0">{pct}%</span>
              </div>
            ))}

            {/* Uploaded thumbnails */}
            {uploadedMedia.length > 0 && (
              <div className="grid grid-cols-3 gap-3">
                {uploadedMedia.map((media) => (
                  <div key={media.mediaId} className="relative group">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={media.url}
                      alt={media.name}
                      className="w-full aspect-square object-cover rounded-lg border border-[#E2E8F0]"
                    />

                    {/* Remove button */}
                    <button
                      id={`img-remove-${media.mediaId}`}
                      onClick={() => removeMedia(media.mediaId)}
                      className="absolute top-1 right-1 w-6 h-6 bg-[#EF4444] text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-xs"
                      aria-label="Remove image"
                    >
                      ×
                    </button>

                    {/* Media class selector */}
                    <select
                      id={`img-class-${media.mediaId}`}
                      value={media.mediaClass}
                      onChange={(e) => setMediaClass(media.mediaId, e.target.value as 'PRODUCT_IMAGE' | 'SWATCH')}
                      className="mt-1 w-full text-xs border border-[#E2E8F0] rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-[#2563EB] bg-white"
                      aria-label="Image type"
                    >
                      <option value="PRODUCT_IMAGE">Product Image</option>
                      <option value="SWATCH">Swatch</option>
                    </select>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Navigation buttons ── */}
        <div className={`flex mt-8 ${step > 1 ? 'justify-between' : 'justify-end'}`}>
          {step > 1 && (
            <button
              id="wizard-back-btn"
              onClick={goBack}
              className="px-5 py-2.5 border border-[#E2E8F0] text-sm font-medium text-[#64748B] rounded-lg hover:bg-[#F8FAFC] transition-colors"
            >
              ← Back
            </button>
          )}

          {step < 3 ? (
            <button
              id="wizard-next-btn"
              onClick={goNext}
              className="px-6 py-2.5 bg-[#2563EB] text-white text-sm font-semibold rounded-lg hover:bg-[#1D4ED8] transition-colors"
            >
              Next →
            </button>
          ) : (
            <button
              id="wizard-submit-btn"
              onClick={() => void handleSubmit()}
              disabled={isSubmitting}
              className="px-6 py-2.5 bg-[#2563EB] text-white text-sm font-semibold rounded-lg hover:bg-[#1D4ED8] transition-colors disabled:opacity-50"
            >
              {isSubmitting ? 'Saving…' : 'Save as Draft'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// SegmentAttrField — single dynamic attribute field
// Zero segment-specific logic — purely driven by schema prop def
// ─────────────────────────────────────────────────────────────

interface AttrPropDef {
  label: string;
  type: 'string' | 'number' | 'boolean' | 'enum';
  options?: string[];
  min?: number;
  max?: number;
  unit?: string;
  description?: string;
}

function SegmentAttrField({
  attrKey,
  prop,
  required,
  value,
  onChange,
  error,
}: {
  attrKey: string;
  prop: AttrPropDef;
  required: boolean;
  value: string;
  onChange: (v: string) => void;
  error?: string;
}): React.JSX.Element {
  const fieldId = `attr-${attrKey}`;
  const label = (
    <label htmlFor={fieldId} className="block text-sm font-medium text-[#1E293B] mb-1.5">
      {prop.label}
      {prop.unit && <span className="text-xs text-[#94A3B8] ml-1">({prop.unit})</span>}
      {required ? (
        <span className="text-[#EF4444] ml-0.5">*</span>
      ) : (
        <span className="text-xs text-[#94A3B8] ml-1">optional</span>
      )}
    </label>
  );

  let input: React.ReactNode;

  if (prop.type === 'enum' && prop.options) {
    input = (
      <select
        id={fieldId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB] bg-white ${error ? 'border-[#EF4444]' : 'border-[#E2E8F0]'}`}
      >
        <option value="">Select…</option>
        {prop.options.map((opt) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
    );
  } else if (prop.type === 'number') {
    input = (
      <input
        id={fieldId}
        type="number"
        min={prop.min}
        max={prop.max}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB] ${error ? 'border-[#EF4444]' : 'border-[#E2E8F0]'}`}
      />
    );
  } else if (prop.type === 'boolean') {
    input = (
      <div className="flex gap-4">
        {['true', 'false'].map((v) => (
          <label key={v} className="flex items-center gap-2 cursor-pointer">
            <input
              id={`${fieldId}-${v}`}
              type="radio"
              name={fieldId}
              value={v}
              checked={value === v}
              onChange={() => onChange(v)}
              className="accent-[#2563EB]"
            />
            <span className="text-sm text-[#1E293B]">{v === 'true' ? 'Yes' : 'No'}</span>
          </label>
        ))}
      </div>
    );
  } else {
    // string
    input = (
      <input
        id={fieldId}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={prop.description ?? `Enter ${prop.label.toLowerCase()}…`}
        className={`w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB] ${error ? 'border-[#EF4444]' : 'border-[#E2E8F0]'}`}
      />
    );
  }

  return (
    <div>
      {label}
      {input}
      {prop.description && !error && (
        <p className="text-xs text-[#94A3B8] mt-1">{prop.description}</p>
      )}
      {error && <p className="text-xs text-[#EF4444] mt-1">{error}</p>}
    </div>
  );
}
