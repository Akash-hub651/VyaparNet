"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../../../app/contexts/auth.context";
import { useHeader } from "../../../../app/contexts/header.context";
import { useSellerPermissions } from "../../../../lib/hooks/useSellerPermissions";
import { useToast } from "../../../../components/ui/Toast";
import {
  getCategories,
  getSegmentAttributeSchema,
  type CategoryResponse,
  type SegmentAttributeSchemaDef,
} from "../../../../lib/api/categories.client";
import {
  createProduct,
  publishProduct,
} from "../../../../lib/api/products.client";

import { DraftData, EMPTY_DRAFT, UploadedMedia } from "./types";
import { Step1BasicInfo } from "./Step1BasicInfo";
import { Step2Pricing } from "./Step2Pricing";
import { Step3Images } from "./Step3Images";
import { formatRelativeTime } from "../../../../lib/formatters";

const DRAFT_PREFIX = "seller-product-draft-";

export default function SellerProductNewPage(): React.JSX.Element | null {
  const router = useRouter();
  const { user, accessToken } = useAuth();
  const { setTitle } = useHeader();
  const permissions = useSellerPermissions();
  const { addToast } = useToast();

  const businessId = user?.businesses?.[0]?.id;
  const DRAFT_KEY = businessId ? `${DRAFT_PREFIX}${businessId}` : null;

  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState<DraftData>(EMPTY_DRAFT);
  const [showRestorePrompt, setShowRestorePrompt] = useState(false);
  const [draftTimestamp, setDraftTimestamp] = useState<number | null>(null);

  const [categories, setCategories] = useState<CategoryResponse[]>([]);
  const [segmentSchema, setSegmentSchema] =
    useState<SegmentAttributeSchemaDef | null>(null);
  const [schemaLoading, setSchemaLoading] = useState(false);

  const [uploadedMedia, setUploadedMedia] = useState<UploadedMedia[]>([]);
  const [publishOption, setPublishOption] = useState<"draft" | "review">(
    "review",
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  // ── Setup & Permission ──────────────────────────────────────
  useEffect(() => {
    setTitle("Naya Product");
    if (permissions.isStaff) {
      addToast({
        message: "Products add karne ki permission nahi hai",
        variant: "error",
      });
      router.push("/products");
    }
  }, [setTitle, permissions.isStaff, router, addToast]);

  // ── Restore draft prompt ────────────────────────────────────
  useEffect(() => {
    if (!DRAFT_KEY) return;
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Expiry check: 7 days
        const age = Date.now() - (parsed.timestamp || 0);
        if (age < 7 * 24 * 60 * 60 * 1000) {
          setDraftTimestamp(parsed.timestamp);
          setShowRestorePrompt(true);
        } else {
          localStorage.removeItem(DRAFT_KEY);
        }
      }
    } catch {
      // Ignore parse errors
    }
  }, [DRAFT_KEY]);

  const restoreDraft = () => {
    if (!DRAFT_KEY) return;
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        setDraft(parsed.fields || EMPTY_DRAFT);
        setStep(parsed.step || 1);
        if (parsed.fields.categoryId) {
          void handleCategoryChange(parsed.fields.categoryId, true);
        }
      }
    } catch {
      addToast({ message: "Draft restore nahi ho paya", variant: "error" });
    }
    setShowRestorePrompt(false);
  };

  const discardDraft = () => {
    if (DRAFT_KEY) localStorage.removeItem(DRAFT_KEY);
    setShowRestorePrompt(false);
    setDraft(EMPTY_DRAFT);
    setStep(1);
  };

  // ── Autosave ───────────────────────────────────────────────
  useEffect(() => {
    if (!DRAFT_KEY || showRestorePrompt) return;

    const saveTimer = setTimeout(() => {
      localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({
          step,
          fields: draft,
          timestamp: Date.now(),
        }),
      );
      setLastSaved(new Date());
    }, 1000); // Debounce auto-save by 1s

    return () => clearTimeout(saveTimer);
  }, [draft, step, DRAFT_KEY, showRestorePrompt]);

  // ── Load categories ─────────────────────────────────────────
  useEffect(() => {
    if (!accessToken) return;
    void getCategories(undefined, accessToken).then((res) => {
      if (res.success && res.data) setCategories(res.data);
    });
  }, [accessToken]);

  // ── Handle Category & Segment Schema ────────────────────────
  const handleCategoryChange = useCallback(
    async (categoryId: string, skipReset = false) => {
      if (!skipReset) {
        setDraft((d) => ({ ...d, categoryId, segmentAttributes: {} }));
      } else {
        setDraft((d) => ({ ...d, categoryId }));
      }

      if (!categoryId || !accessToken) {
        setSegmentSchema(null);
        return;
      }

      // Determine segment from chosen category
      const findCat = (
        cats: CategoryResponse[],
        id: string,
      ): CategoryResponse | undefined => {
        for (const c of cats) {
          if (c.id === id) return c;
          if (c.children) {
            const found = findCat(c.children, id);
            if (found) return found;
          }
        }
        return undefined;
      };

      const cat = findCat(categories, categoryId);
      if (!cat) return;

      setSchemaLoading(true);
      const res = await getSegmentAttributeSchema(cat.segment, accessToken);
      if (res.success && res.data) {
        setSegmentSchema(res.data.schema);
      }
      setSchemaLoading(false);
    },
    [categories, accessToken],
  );

  // ── State Updaters ──────────────────────────────────────────
  const updateDraft = (key: keyof DraftData, value: string | string[]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setErrors((e) => {
      const copy = { ...e };
      delete copy[key];
      return copy;
    });
  };

  const updateSegmentAttr = (key: string, value: string) => {
    setDraft((d) => ({
      ...d,
      segmentAttributes: { ...d.segmentAttributes, [key]: value },
    }));
    setErrors((e) => {
      const copy = { ...e };
      delete copy[`attr_${key}`];
      return copy;
    });
  };

  // ── Validation ──────────────────────────────────────────────
  const validateStep1 = (): boolean => {
    const errs: Record<string, string> = {};
    if (!draft.name.trim() || draft.name.trim().length < 3) {
      errs["name"] = "Product name must be at least 3 characters";
    }
    if (!draft.categoryId) {
      errs["categoryId"] = "Please select a segment";
    }
    if (!draft.description.trim() || draft.description.trim().length < 50) {
      errs["description"] =
        "Description kam se kam 50 characters ki honi chahiye";
    }

    if (segmentSchema) {
      for (const reqKey of segmentSchema.required) {
        if (!draft.segmentAttributes[reqKey]) {
          errs[`attr_${reqKey}`] =
            `${segmentSchema.properties[reqKey]?.label ?? reqKey} required hai`;
        }
      }
    }
    setErrors(errs);
    if (Object.keys(errs).length > 0) {
      addToast({
        message: "Kuch fields miss ho gaye hain. Please check karein.",
        variant: "error",
      });
      return false;
    }
    return true;
  };

  const validateStep2 = (): boolean => {
    const errs: Record<string, string> = {};
    if (!draft.basePrice || Number(draft.basePrice) <= 0) {
      errs["basePrice"] = "Price enter karein";
    }
    if (!draft.unit.trim()) {
      errs["unit"] = "Unit select karein";
    }
    if (!draft.gstPercent) {
      errs["gstPercent"] = "GST rate select karein";
    }
    if (!draft.initialStock || Number(draft.initialStock) < 0) {
      errs["initialStock"] = "Initial stock enter karein";
    }
    setErrors(errs);
    if (Object.keys(errs).length > 0) {
      addToast({ message: "Pricing details poori karein.", variant: "error" });
      return false;
    }
    return true;
  };

  const validateStep3 = (): boolean => {
    if (publishOption === "review" && uploadedMedia.length === 0) {
      addToast({
        message: "Review ke liye kam se kam 1 photo zaroori hai",
        variant: "error",
      });
      return false;
    }
    return true;
  };

  // ── Navigation ──────────────────────────────────────────────
  const goNext = () => {
    if (step === 1 && !validateStep1()) return;
    if (step === 2 && !validateStep2()) return;
    setStep((s) => Math.min(s + 1, 3));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const goBack = () => {
    setStep((s) => Math.max(s - 1, 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // ── Submit ──────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!accessToken) return;
    if (step === 3 && !validateStep3()) return;

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
        tags: draft.tags
          ? draft.tags
              .split(",")
              .map((t) => t.trim())
              .filter(Boolean)
          : [],
        initialStock: Number(draft.initialStock) || 0,
        lowStockAlert: draft.lowStockAlert
          ? Number(draft.lowStockAlert)
          : undefined,
        mediaIds: draft.mediaIds,
        segmentAttributes: Object.fromEntries(
          Object.entries(draft.segmentAttributes).filter(([, v]) => v !== ""),
        ),
      },
      accessToken,
    );

    if (!res.success) {
      addToast({
        message: res.error || "Product create nahi ho paya",
        variant: "error",
      });
      setIsSubmitting(false);
      return;
    }
    if (!res.data) {
      addToast({ message: "Product create nahi ho paya", variant: "error" });
      setIsSubmitting(false);
      return;
    }

    if (DRAFT_KEY) localStorage.removeItem(DRAFT_KEY);

    if (publishOption === "review") {
      const pubRes = await publishProduct(res.data.id, accessToken);
      if (!pubRes.success) {
        addToast({
          message: "Product draft ban gaya, par publish nahi ho paya.",
          variant: "warning",
        });
      } else {
        addToast({
          message: "Product review ke liye submit ho gaya!",
          variant: "success",
        });
      }
    } else {
      addToast({
        message: "Product draft mein save ho gaya.",
        variant: "success",
      });
    }

    router.push("/products");
  };

  // ─────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────

  if (permissions.isStaff) return null;

  return (
    <div className="max-w-2xl mx-auto pb-12">
      <div className="sr-only" aria-live="polite">
        Step {step} of 3:{" "}
        {step === 1
          ? "Basic Info"
          : step === 2
            ? "Pricing & Stock"
            : "Images & Publish"}
      </div>

      {/* Draft Restore Banner */}
      {showRestorePrompt && draftTimestamp && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex gap-3">
            <span className="text-xl">📝</span>
            <div>
              <p className="text-sm font-medium text-amber-900">
                Ek adhoora product draft mila
              </p>
              <p className="text-xs text-amber-700 mt-0.5">
                Saved:{" "}
                {formatRelativeTime(new Date(draftTimestamp).toISOString())}
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={discardDraft}
              className="text-sm font-medium text-amber-700 hover:text-amber-900 transition-colors px-2 py-1"
            >
              Naya Shuru Karein
            </button>
            <button
              onClick={restoreDraft}
              className="bg-amber-100 hover:bg-amber-200 text-amber-900 text-sm font-semibold px-4 py-2 rounded-lg transition-colors border border-amber-300"
            >
              Draft Se Continue Karein
            </button>
          </div>
        </div>
      )}

      {/* Row B: Step Indicator */}
      <div className="mb-8" role="list">
        <div className="flex items-center justify-between relative max-w-md mx-auto">
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-0.5 bg-neutral-200 -z-10" />
          <div
            className="absolute left-0 top-1/2 -translate-y-1/2 h-0.5 bg-brand-500 -z-10 transition-all duration-300"
            style={{ width: `${(step - 1) * 50}%` }}
          />

          {[
            { n: 1, label: "Basic Info" },
            { n: 2, label: "Pricing & Stock" },
            { n: 3, label: "Images & Publish" },
          ].map((s) => {
            const isCurrent = step === s.n;
            const isPast = step > s.n;
            return (
              <div
                key={s.n}
                className="flex flex-col items-center gap-2 bg-surface"
                role="listitem"
                aria-current={isCurrent ? "step" : undefined}
              >
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-colors ${
                    isCurrent
                      ? "bg-brand-600 text-white ring-4 ring-brand-100"
                      : isPast
                        ? "bg-brand-500 text-white"
                        : "bg-neutral-200 text-text-secondary"
                  }`}
                >
                  {isPast ? (
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="3"
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  ) : (
                    s.n
                  )}
                </div>
                <span
                  className={`text-xs font-medium px-2 bg-surface ${isCurrent ? "text-brand-700" : isPast ? "text-text-primary" : "text-text-secondary"}`}
                >
                  {s.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Row C: Form Card */}
      <div className="bg-surface-card rounded-xl shadow-1 border border-neutral-200 p-6 sm:p-8">
        {step === 1 && (
          <Step1BasicInfo
            draft={draft}
            categories={categories}
            segmentSchema={segmentSchema}
            schemaLoading={schemaLoading}
            errors={errors}
            updateDraft={updateDraft}
            updateSegmentAttr={updateSegmentAttr}
            handleCategoryChange={handleCategoryChange}
          />
        )}

        {step === 2 && (
          <Step2Pricing
            draft={draft}
            errors={errors}
            updateDraft={updateDraft}
          />
        )}

        {step === 3 && (
          <Step3Images
            draft={draft}
            uploadedMedia={uploadedMedia}
            setUploadedMedia={setUploadedMedia}
            updateDraft={updateDraft}
            publishOption={publishOption}
            setPublishOption={setPublishOption}
          />
        )}

        {/* Row D: Navigation Footer */}
        <div className="flex items-center justify-between mt-8 pt-6 border-t border-neutral-100">
          <button
            onClick={goBack}
            disabled={step === 1 || isSubmitting}
            className={`px-5 py-2.5 text-sm font-semibold rounded-lg transition-colors ${
              step === 1
                ? "opacity-0 pointer-events-none"
                : "text-text-secondary hover:bg-neutral-100 disabled:opacity-50"
            }`}
          >
            ← Pichha
          </button>

          {step < 3 ? (
            <button
              onClick={goNext}
              className="bg-brand-600 text-white px-6 py-2.5 text-sm font-semibold rounded-lg hover:bg-brand-700 active:bg-brand-800 transition-colors min-h-[44px]"
            >
              Aage Jaiye →
            </button>
          ) : (
            <button
              onClick={() => void handleSubmit()}
              disabled={isSubmitting}
              aria-busy={isSubmitting}
              className={`text-white px-6 py-2.5 text-sm font-semibold rounded-lg transition-colors min-h-[44px] flex items-center gap-2 ${
                isSubmitting
                  ? "bg-brand-400 cursor-not-allowed"
                  : "bg-brand-600 hover:bg-brand-700 active:bg-brand-800"
              }`}
            >
              {isSubmitting ? (
                <>
                  <svg
                    className="animate-spin w-4 h-4"
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
                  Saving...
                </>
              ) : publishOption === "review" ? (
                "Review Ke Liye Submit"
              ) : (
                "Draft Mein Save"
              )}
            </button>
          )}
        </div>
      </div>

      {/* Row E: Auto-save Indicator */}
      <div className="mt-4 text-center">
        {!DRAFT_KEY ? (
          <p className="text-xs text-text-muted flex items-center justify-center gap-1.5">
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            Auto-save disabled for this session
          </p>
        ) : lastSaved ? (
          <p
            className="text-xs text-text-secondary flex items-center justify-center gap-1.5"
            aria-live="polite"
          >
            <span aria-hidden="true">💾</span> Last saved:{" "}
            {lastSaved.toLocaleTimeString("en-US", {
              hour: "numeric",
              minute: "2-digit",
              hour12: true,
            })}
          </p>
        ) : (
          <p className="text-xs text-text-muted flex items-center justify-center gap-1.5">
            <span aria-hidden="true">💾</span> Auto-saving...
          </p>
        )}
      </div>
    </div>
  );
}
