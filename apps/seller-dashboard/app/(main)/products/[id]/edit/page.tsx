"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Archive,
  CheckCircle,
  Clock,
  XCircle,
  AlertCircle,
} from "lucide-react";

import { useHeader } from "../../../../contexts/header.context";
import { useAuth } from "../../../../contexts/auth.context";
import { useSellerPermissions } from "../../../../../lib/hooks/useSellerPermissions";
import { useToast } from "../../../../../components/ui/Toast";
import { Button } from "../../../../../components/ui/Button";
import { SkeletonText, Skeleton } from "../../../../../components/ui/Skeleton";
import { ErrorBanner } from "../../../../../components/ui/ErrorBanner";
import { ConfirmDialog } from "../../../../../components/ui/Modal";

import {
  getSellerProduct,
  updateProduct,
  ProductResponse,
  UpdateProductDto,
} from "../../../../../lib/api/products.client";
import {
  getCategories,
  CategoryResponse,
  getSegmentAttributeSchema,
} from "../../../../../lib/api/categories.client";

import { DraftData, EMPTY_DRAFT } from "../../components/types";
import { Step1BasicInfo } from "../../components/Step1BasicInfo";
import { Step2Pricing } from "../../components/Step2Pricing";
import { Step3Images } from "../../components/Step3Images";
import { formatRelativeTime } from "../../../../../lib/formatters";
import { SegmentAttributeSchemaDef } from "../../../../../lib/api/categories.client";

/**
 * D-02 RESOLUTION — Product Edit Draft Storage
 * Authority: seller_dashboard_architecture.md §4 "localStorage Exception Rule"
 * Decision: Product edit draft uses sessionStorage (NOT localStorage).
 * Rationale: Same as products/new — sessionStorage cleared on tab close, no auth data stored.
 */
const DRAFT_PREFIX = "seller-product-edit-draft-";

export default function ProductEditPage({
  params,
}: {
  params: { id: string };
}) {
  const router = useRouter();
  const { setTitle } = useHeader();
  const { user, accessToken } = useAuth();
  const { isStaff } = useSellerPermissions();
  const { addToast } = useToast();

  const businessId = user?.businesses?.[0]?.id;
  const draftKey = businessId
    ? `${DRAFT_PREFIX}${params.id}-${businessId}`
    : null;

  // -- State --
  const [product, setProduct] = useState<ProductResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState<DraftData>(EMPTY_DRAFT);

  // -- Categories & Schema State --
  const [categories, setCategories] = useState<CategoryResponse[]>([]);
  const [segmentSchema, setSegmentSchema] =
    useState<SegmentAttributeSchemaDef | null>(null);
  const [schemaLoading, setSchemaLoading] = useState(false);

  // Validation / interaction state
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Modals & Banners state
  const [ackChecked, setAckChecked] = useState(false);
  const [showSegmentChangeModal, setShowSegmentChangeModal] = useState(false);
  const [pendingSegmentId, setPendingSegmentId] = useState<string | null>(null);
  const [showRestorePrompt, setShowRestorePrompt] = useState(false);
  const [draftTimestamp, setDraftTimestamp] = useState<number | null>(null);

  // Deep equality check for "dirty" state
  const isDirty = useMemo(() => {
    if (!product) return false;

    // Quick heuristic: compare JSON string of current draft mapped payload vs original
    const mappedDraft = {
      name: draft.name,
      description: draft.description,
      categoryId: draft.categoryId,
      basePrice: Number(draft.basePrice),
      moq: Number(draft.moq),
      unit: draft.unit,
      hsnCode: draft.hsnCode,
      gstPercent: Number(draft.gstPercent),
      tags: draft.tags,
      mediaIds: draft.media.map((m) => m.mediaId),
      segmentAttributes: draft.segmentAttributes,
    };

    const originalData = {
      name: product.name,
      description: product.description || "",
      categoryId: product.categoryId,
      basePrice: product.basePrice,
      moq: product.moq || 1,
      unit: product.unit || "piece",
      hsnCode: product.hsnCode || "",
      gstPercent: product.gstPercent || 0,
      tags: product.tags.join(", "),
      mediaIds: product.media?.map((m: { mediaId: string }) => m.mediaId) || [],
      segmentAttributes: product.segmentAttributes || {},
    };

    return JSON.stringify(mappedDraft) !== JSON.stringify(originalData);
  }, [product, draft]);

  // -- Permissions Guard --
  useEffect(() => {
    setTitle("Product Edit");
  }, [setTitle]);

  // -- Load categories ─────────────────────────────────────────
  useEffect(() => {
    if (!accessToken) return;
    void getCategories(undefined, accessToken).then(
      (res: { success: boolean; data?: CategoryResponse[] }) => {
        if (res.success && res.data) setCategories(res.data);
      },
    );
  }, [accessToken]);

  // -- Handle Category & Segment Schema ────────────────────────
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

  // -- Data Fetching --
  const loadProduct = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const res = await getSellerProduct(params.id, accessToken);
      if (res.success && res.data) {
        setProduct(res.data);

        const p = res.data;
        const initialDraft: DraftData = {
          step: 1,
          name: p.name,
          description: p.description || "",
          categoryId: p.categoryId,
          tags: p.tags.join(", "),
          segmentAttributes:
            (p.segmentAttributes as Record<string, string>) || {},
          basePrice: p.basePrice.toString(),
          mrp: p.mrp ? p.mrp.toString() : "",
          moq: p.moq.toString(),
          unit: p.unit,
          hsnCode: p.hsnCode || "",
          gstPercent: p.gstPercent ? p.gstPercent.toString() : "",
          initialStock: "",
          lowStockAlert: "",
          media: p.media
            ? p.media.map(
                (m: {
                  mediaId: string;
                  url: string;
                  mediaClass: string;
                  altText?: string | null;
                }) => ({
                  mediaId: m.mediaId,
                  url: m.url,
                  mediaClass:
                    m.mediaClass === "SWATCH" ? "SWATCH" : "PRODUCT_IMAGE",
                  name: m.altText || "Product Image",
                }),
              )
            : [],
        };

        if (p.categoryId) {
          void handleCategoryChange(p.categoryId, true);
        }

        if (draftKey) {
          try {
            const saved = sessionStorage.getItem(draftKey);
            if (saved) {
              const parsed = JSON.parse(saved);
              const age = Date.now() - parsed.timestamp;
              if (age < 24 * 60 * 60 * 1000) {
                setDraftTimestamp(parsed.timestamp);
                setShowRestorePrompt(true);
                (
                  window as unknown as { __storedDraft: DraftData }
                ).__storedDraft = parsed;
              }
            }
          } catch {
            // Ignore corrupted draft
          }
        }

        setDraft(initialDraft);
      } else {
        setError("Product load nahi ho payi.");
      }
    } catch {
      setError("Product ki details load nahi ho payi.");
    } finally {
      setLoading(false);
    }
  }, [params.id, accessToken, draftKey, handleCategoryChange]);

  // Staff permission redirect
  useEffect(() => {
    if (isStaff && !loading) {
      addToast({
        message: "Products edit karne ki permission nahi hai",
        variant: "error",
      });
      router.replace("/products");
    }
  }, [isStaff, loading, addToast, router]);

  useEffect(() => {
    if (categories.length > 0 && !isStaff) {
      void Promise.resolve().then(() => {
        void loadProduct();
      });
    }
  }, [loadProduct, categories.length, isStaff]);

  // -- Auto Save (Every 60s) --
  useEffect(() => {
    if (!draftKey || !isDirty || !product) return;

    const timer = setInterval(() => {
      sessionStorage.setItem(
        draftKey,
        JSON.stringify({
          ...draft,
          timestamp: Date.now(),
        }),
      );
    }, 60000);

    return () => clearInterval(timer);
  }, [draft, draftKey, isDirty, product]);

  // -- Handlers --
  const updateDraft = (
    key: keyof DraftData,
    value: DraftData[keyof DraftData],
  ) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: "" }));
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

  const handleRestoreDraft = () => {
    const saved = (window as unknown as { __storedDraft: DraftData })
      .__storedDraft;
    if (saved) {
      setDraft(saved);
      setStep(saved.step || 1);
    }
    setShowRestorePrompt(false);
  };

  const validateStep1 = () => {
    const errs: Record<string, string> = {};
    if (!draft.name || draft.name.length < 3)
      errs["name"] = "Naam kam se kam 3 characters ka hona chahiye";
    if (!draft.categoryId) errs["categoryId"] = "Segment select karein";
    if (!draft.description || draft.description.length < 50)
      errs["description"] = "Description mein kam se kam 50 characters likhein";

    setErrors(errs);
    if (Object.keys(errs).length > 0) {
      addToast({
        message: "Pehle zaroori fields poori karein.",
        variant: "error",
      });
      return false;
    }
    return true;
  };

  const validateStep2 = () => {
    const errs: Record<string, string> = {};
    if (!draft.basePrice || Number(draft.basePrice) <= 0)
      errs["basePrice"] = "Price 0 se zyada hona chahiye";
    if (!draft.gstPercent) errs["gstPercent"] = "GST rate select karein";

    setErrors(errs);
    if (Object.keys(errs).length > 0) {
      addToast({ message: "Pricing details poori karein.", variant: "error" });
      return false;
    }
    return true;
  };

  const nextStep = () => {
    if (step === 1 && validateStep1()) setStep(2);
    if (step === 2 && validateStep2()) setStep(3);
  };

  const prevStep = () => {
    if (step > 1) setStep(step - 1);
  };

  const handleSubmit = async (targetStatus?: "DRAFT" | "PENDING_REVIEW") => {
    if (!accessToken || !product) return;

    if (step === 1 && !validateStep1()) return;
    if (step === 2 && !validateStep2()) return;

    // For Active status, must acknowledge
    if (product.status === "ACTIVE" && !ackChecked) {
      addToast({
        message: "Bina acknowledgement check kiye save nahi kar sakte.",
        variant: "error",
      });
      return;
    }

    // Step 3 Validation: Images required unless draft
    const finalStatus = targetStatus || product.status;
    if (finalStatus !== "DRAFT" && draft.media.length === 0) {
      addToast({
        message: "Kam se kam 1 photo zaroori hai (Draft chhod ke).",
        variant: "error",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const payload: UpdateProductDto = {
        name: draft.name.trim(),
        description: draft.description.trim(),
        categoryId: draft.categoryId,
        basePrice: Number(draft.basePrice),
        mrp: draft.mrp ? Number(draft.mrp) : undefined,
        moq: Number(draft.moq) || 1,
        unit: draft.unit,
        hsnCode: draft.hsnCode.trim() || undefined,
        gstPercent: draft.gstPercent ? Number(draft.gstPercent) : undefined,
        tags: draft.tags
          ? draft.tags
              .split(",")
              .map((t) => t.trim())
              .filter(Boolean)
          : [],
        mediaIds: draft.media.map((m) => m.mediaId),
        segmentAttributes: Object.fromEntries(
          Object.entries(draft.segmentAttributes).filter(([, v]) => v !== ""),
        ),
      };

      const res = await updateProduct(product.id, payload, accessToken);

      if (res.success) {
        if (draftKey) sessionStorage.removeItem(draftKey);
        addToast({
          message: "Product successfully update ho gaya!",
          variant: "success",
        });

        if (product.status === "REJECTED") {
          router.push("/products?tab=pending-review");
        } else {
          window.location.reload();
        }
      } else {
        addToast({
          message: res.error || "Changes save nahi ho payi.",
          variant: "error",
        });
      }
    } catch {
      addToast({
        message: "Network error. Changes save nahi ho payi.",
        variant: "error",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Staff Blocker UI (while redirecting)
  if (isStaff) {
    return (
      <div className="max-w-2xl mx-auto py-12 px-4 flex justify-center">
        <p className="text-sm text-text-secondary">Redirecting...</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto pb-12 px-4 space-y-6">
        <Skeleton className="h-8 w-1/3" />
        <div className="bg-surface-card rounded-xl shadow-1 p-6 space-y-6">
          <SkeletonText lines={4} />
        </div>
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="max-w-2xl mx-auto pb-12 px-4">
        <ErrorBanner message={error || "Product nahi mili."} />
        <div className="mt-6 flex justify-center">
          <Button variant="primary" onClick={() => router.push("/products")}>
            ← Products Pe Jaiye
          </Button>
        </div>
      </div>
    );
  }

  // PENDING REVIEW Blocker
  if (product.status === "PENDING_APPROVAL") {
    return (
      <div className="max-w-2xl mx-auto pb-12 px-4 mt-8">
        <div className="bg-surface-card border border-warning-200 rounded-xl p-8 flex flex-col items-center text-center">
          <Clock className="w-12 h-12 text-warning-500 mb-4" />
          <h2 className="text-xl font-semibold text-warning-700 mb-2">
            Product Review Mein Hai
          </h2>
          <p className="text-sm text-text-secondary max-w-md mb-6">
            Admin {product.name} ko review kar raha hai. Ye process 24-48 ghante
            leta hai. Jab tak review complete na ho, aap edit nahi kar sakte.
          </p>
          <Button variant="secondary" onClick={() => router.push("/products")}>
            ← Products Pe Wapas Jaiye
          </Button>
          <p className="text-xs text-text-muted mt-4">
            Notification milegi jab review complete hoga.
          </p>
        </div>
      </div>
    );
  }

  const parseRejectionReasons = (reasonStr: string) => {
    if (!reasonStr) return [];
    return reasonStr
      .split(/(?:\r?\n|;)+/)
      .map((s) => s.trim())
      .filter(Boolean);
  };

  return (
    <div className="max-w-2xl mx-auto pb-12 px-4 mt-4">
      <div className="sr-only" aria-live="polite">
        Step {step} of 3:{" "}
        {step === 1
          ? "Basic Info"
          : step === 2
            ? "Pricing & Stock"
            : "Images & Publish"}
      </div>

      {/* Restore Banner */}
      {showRestorePrompt && draftTimestamp && (
        <div className="mb-6 bg-amber-50 border border-amber-200 rounded-lg p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-amber-500 shrink-0" />
            <p className="text-sm text-amber-800">
              <span className="font-medium">Ek adhoora product draft mila</span>{" "}
              (saved:{" "}
              {formatRelativeTime(new Date(draftTimestamp).toISOString())})
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setShowRestorePrompt(false)}
              className="text-sm text-amber-700 font-medium hover:text-amber-800 focus:outline-none"
            >
              Naya Shuru Karein
            </button>
            <button
              onClick={handleRestoreDraft}
              className="text-sm bg-amber-100 text-amber-800 px-3 py-1.5 rounded-md font-medium hover:bg-amber-200 focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              Draft Se Continue Karein
            </button>
          </div>
        </div>
      )}

      {/* STATUS BANNERS */}
      {product.status === "ACTIVE" && (
        <div
          className="mb-6 bg-warning-50 border-l-4 border-warning-500 p-4 rounded-r-lg"
          role="alert"
        >
          <div className="flex gap-3">
            <AlertTriangle className="w-5 h-5 text-warning-500 shrink-0" />
            <div>
              <p className="text-sm font-medium text-warning-800">
                Ye product abhi live hai — buyers dekh sakte hain.
              </p>
              <p className="text-xs text-warning-700 mt-1">
                Changes save karne ke baad ye temporarily unlisted ho jayega jab
                tak admin re-review na kare (24-48 hrs).
              </p>
              <div className="mt-3 flex items-start gap-2">
                <input
                  type="checkbox"
                  id="ack-active"
                  checked={ackChecked}
                  onChange={(e) => setAckChecked(e.target.checked)}
                  className="mt-0.5 rounded border-warning-400 text-warning-600 focus:ring-warning-500"
                  aria-required="true"
                />
                <label
                  htmlFor="ack-active"
                  className="text-sm text-warning-700 select-none"
                >
                  Main samajhta/samajhti hoon aur save karna chahta/chahti hoon
                </label>
              </div>
            </div>
          </div>
        </div>
      )}

      {product.status === "ARCHIVED" && (
        <div
          className="mb-6 bg-neutral-50 border-l-4 border-neutral-400 p-4 rounded-r-lg"
          role="alert"
        >
          <div className="flex gap-3">
            <Archive className="w-5 h-5 text-neutral-400 shrink-0" />
            <div>
              <p className="text-sm font-medium text-neutral-700">
                Ye product archived hai — buyers ise nahi dekh sakte.
              </p>
              <p className="text-xs text-neutral-500 mt-1">
                Yahan changes save karne ke baad product DRAFT mein chala
                jayega. Phir aap ise review ke liye submit kar sakte hain.
              </p>
            </div>
          </div>
        </div>
      )}

      {product.status === "REJECTED" && (
        <div
          className="mb-6 bg-error-50 border border-error-200 rounded-lg p-4"
          role="region"
          aria-label="Rejection reasons"
        >
          <div className="flex gap-3">
            <XCircle className="w-5 h-5 text-error-500 shrink-0" />
            <div className="w-full">
              <h3 className="text-sm font-bold text-error-700">
                Product Reject Ho Gaya
              </h3>
              <p className="text-xs text-error-600 mt-0.5">
                Buyers is product ko nahi dekh pa rahe. Neeche reasons fix
                karein.
              </p>

              <ul className="mt-3 space-y-1" role="list">
                {parseRejectionReasons(
                  product.rejectionReason || "No reason provided",
                ).map((r, i) => (
                  <li
                    key={i}
                    className="text-sm text-error-700 flex items-start gap-2"
                    role="listitem"
                  >
                    <span aria-hidden="true">•</span> <span>{r}</span>
                  </li>
                ))}
              </ul>

              <p className="text-xs text-error-500/80 mt-4 border-t border-error-200/50 pt-2">
                Ye issues fix karke dobara submit karein
              </p>
            </div>
          </div>
        </div>
      )}

      {/* STEP INDICATOR */}
      <div className="mb-6 flex items-center justify-between" role="list">
        {[1, 2, 3].map((num, i) => (
          <React.Fragment key={num}>
            <div
              role="listitem"
              aria-current={step === num ? "step" : undefined}
              className={`flex flex-col items-center gap-2 ${step === num ? "opacity-100" : "opacity-50"}`}
            >
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-colors
                  ${step > num ? "bg-brand-600 border-brand-600 text-white" : step === num ? "bg-white border-brand-600 text-brand-600" : "bg-white border-neutral-300 text-neutral-400"}
                `}
              >
                {step > num ? <CheckCircle className="w-5 h-5" /> : num}
              </div>
              <span
                className={`text-xs font-medium hidden sm:block
                  ${step >= num ? "text-text-primary" : "text-text-muted"}
                `}
              >
                {num === 1
                  ? "Basic Info"
                  : num === 2
                    ? "Pricing & Stock"
                    : "Images"}
              </span>
            </div>
            {i < 2 && (
              <div
                className={`flex-1 h-0.5 mx-2 sm:mx-4 transition-colors ${step > num ? "bg-brand-600" : "bg-neutral-200"}`}
                aria-hidden="true"
              />
            )}
          </React.Fragment>
        ))}
      </div>

      {/* FORM CARD */}
      <div className="bg-surface-card rounded-xl shadow-1 p-4 sm:p-6 mb-4">
        {step === 1 && (
          <Step1BasicInfo
            draft={draft}
            categories={categories}
            segmentSchema={segmentSchema}
            schemaLoading={schemaLoading}
            updateSegmentAttr={updateSegmentAttr}
            handleCategoryChange={(v: string) => {
              if (draft.categoryId && draft.categoryId !== v) {
                setPendingSegmentId(v as string);
                setShowSegmentChangeModal(true);
              } else {
                void handleCategoryChange(v as string);
              }
            }}
            updateDraft={updateDraft}
            errors={errors}
          />
        )}

        {step === 2 && (
          <Step2Pricing
            draft={draft}
            updateDraft={updateDraft}
            errors={errors}
            isEditMode={true}
          />
        )}

        {step === 3 && <Step3Images draft={draft} updateDraft={updateDraft} />}

        {/* NAVIGATION FOOTER */}
        <div className="flex flex-col-reverse sm:flex-row justify-between items-center gap-3 mt-8 pt-6 border-t border-neutral-100">
          <button
            onClick={prevStep}
            disabled={step === 1 || isSubmitting}
            className={`w-full sm:w-auto px-6 py-2.5 text-sm font-semibold rounded-lg transition-colors min-h-[44px] ${
              step === 1
                ? "invisible"
                : "text-neutral-600 hover:bg-neutral-100 active:bg-neutral-200"
            }`}
          >
            ← Pichha
          </button>

          {step < 3 ? (
            <button
              onClick={nextStep}
              disabled={isSubmitting}
              className="w-full sm:w-auto bg-brand-600 text-white px-6 py-2.5 text-sm font-semibold rounded-lg hover:bg-brand-700 active:bg-brand-800 transition-colors min-h-[44px]"
            >
              Aage Jaiye →
            </button>
          ) : (
            <div className="flex flex-col sm:flex-row w-full sm:w-auto gap-3">
              {/* Dynamic CTAs based on Status */}
              {product.status === "DRAFT" && (
                <>
                  <button
                    onClick={() => void handleSubmit("DRAFT")}
                    disabled={isSubmitting}
                    className="w-full sm:w-auto border border-neutral-300 text-neutral-700 px-6 py-2.5 text-sm font-semibold rounded-lg hover:bg-neutral-50 transition-colors min-h-[44px]"
                  >
                    💾 Draft Update Karein
                  </button>
                  <button
                    onClick={() => void handleSubmit("PENDING_REVIEW")}
                    disabled={isSubmitting}
                    aria-busy={isSubmitting}
                    className="w-full sm:w-auto bg-brand-600 text-white px-6 py-2.5 text-sm font-semibold rounded-lg hover:bg-brand-700 transition-colors min-h-[44px]"
                  >
                    Review Ke Liye Submit
                  </button>
                </>
              )}

              {product.status === "ACTIVE" && (
                <button
                  onClick={() => void handleSubmit()}
                  disabled={isSubmitting || !ackChecked}
                  aria-busy={isSubmitting}
                  className={`w-full sm:w-auto px-6 py-2.5 text-sm font-semibold rounded-lg transition-colors min-h-[44px] text-white
                     ${!ackChecked || isSubmitting ? "bg-brand-400 cursor-not-allowed" : "bg-brand-600 hover:bg-brand-700"}
                   `}
                >
                  ✓ Changes Save Karein
                </button>
              )}

              {product.status === "REJECTED" && (
                <div className="flex flex-col gap-1 w-full sm:w-auto">
                  <button
                    onClick={() => void handleSubmit()}
                    disabled={isSubmitting}
                    aria-busy={isSubmitting}
                    className="w-full bg-brand-600 text-white px-8 py-2.5 text-sm font-semibold rounded-lg hover:bg-brand-700 transition-colors min-h-[44px]"
                  >
                    Review Ke Liye Submit
                  </button>
                  <span className="text-center sm:text-right text-xs text-text-muted mt-1">
                    Rejection fix karke submit karein
                  </span>
                </div>
              )}

              {product.status === "ARCHIVED" && (
                <div className="flex flex-col gap-1 w-full sm:w-auto">
                  <button
                    onClick={() => void handleSubmit()}
                    disabled={isSubmitting}
                    aria-busy={isSubmitting}
                    className="w-full bg-brand-600 text-white px-6 py-2.5 text-sm font-semibold rounded-lg hover:bg-brand-700 transition-colors min-h-[44px]"
                  >
                    💾 Draft Mein Save Karein
                  </button>
                  <span className="text-center sm:text-right text-xs text-text-muted mt-1">
                    Save karne ke baad product DRAFT mein jayega
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {isDirty && (
        <div className="flex justify-center mt-4">
          <span className="text-xs text-text-muted flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-amber-500"></span> Unsaved
            changes
          </span>
        </div>
      )}

      {/* Segment Change Confirmation */}
      <ConfirmDialog
        isOpen={showSegmentChangeModal}
        onClose={() => {
          setPendingSegmentId(null);
          setShowSegmentChangeModal(false);
        }}
        onConfirm={() => {
          if (pendingSegmentId) {
            void handleCategoryChange(pendingSegmentId);
          }
          setPendingSegmentId(null);
          setShowSegmentChangeModal(false);
        }}
        title="Segment change karein?"
        description={`Segment badloge to ${categories.find((c) => c.id === draft.categoryId)?.name || "is segment"} ke sab special fields reset ho jayenge aur khali ho jayenge. Ye action undo nahi hogi.`}
        confirmLabel="Haan, Change Karein"
        cancelLabel="Nahi, Cancel"
      />
    </div>
  );
}
