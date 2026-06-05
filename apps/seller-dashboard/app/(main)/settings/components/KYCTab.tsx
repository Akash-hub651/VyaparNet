import React, { useState, useEffect } from "react";
import { useAuth } from "../../../contexts/auth.context";
import { useToast } from "../../../../components/ui/Toast";
import {
  KycDocumentConfig,
  getKycRequiredDocuments,
  submitKycDocuments,
} from "../../../../lib/api/settings.client";
import { KycStatusCard } from "./KYCTab/KycStatusCard";
import { DocumentUploadCard } from "./KYCTab/DocumentUploadCard";
import { DocumentPreviewModal } from "./KYCTab/DocumentPreviewModal";

export function KYCTab() {
  const { user, accessToken } = useAuth();
  const { addToast } = useToast();

  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const [documents, setDocuments] = useState<KycDocumentConfig[]>([]);

  // State for preview modal
  const [previewFile, setPreviewFile] = useState<{
    url: string;
    filename: string;
    type?: string;
  } | null>(null);

  // State for form submission
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Overall KYC status is derived from the user object via AuthContext
  // Default to NOT_SUBMITTED if missing
  const safeUser = user as unknown as Record<string, Record<string, string>>;
  const currentKycStatus = (safeUser?.["business"]?.["kycStatus"] ||
    "NOT_SUBMITTED") as import("../../../../lib/api/settings.client").KycStatus;
  const isKycPendingOrVerified =
    currentKycStatus === "PENDING" || currentKycStatus === "VERIFIED";

  const fetchDocuments = async () => {
    if (!accessToken) return;
    setIsLoading(true);
    setIsError(false);

    try {
      const res = await getKycRequiredDocuments(accessToken);
      if (!res.success) {
        setIsError(true);
      } else if (res.data) {
        setDocuments(res.data);
      } else {
        setDocuments([]);
      }
    } catch {
      setIsError(true);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchDocuments();
  }, [accessToken]);

  const handleUploadSuccess = (
    docId: string,
    fileData: { id: string; filename: string; url: string; sizeBytes: number },
  ) => {
    setDocuments((prev) =>
      prev.map((doc) => {
        if (doc.id === docId) {
          return {
            ...doc,
            status: "uploaded",
            currentFile: fileData,
          };
        }
        return doc;
      }),
    );
  };

  const handleSubmit = async () => {
    if (!accessToken) return;
    setIsSubmitting(true);

    // Validate again just to be safe
    const allRequiredUploaded = documents.every(
      (d) => !d.required || d.status === "uploaded",
    );
    if (!allRequiredUploaded) {
      addToast({
        message: "Kripya sabhi required documents upload karein.",
        variant: "error",
      });
      setIsSubmitting(false);
      return;
    }

    try {
      const res = await submitKycDocuments(accessToken);
      if (!res.success) {
        addToast({
          message: "KYC submit nahi ho paya. " + res.error,
          variant: "error",
        });
      } else {
        addToast({
          message:
            "KYC documents submit ho gaye! 24-48 ghante mein verify hoga.",
          variant: "success",
        });
        // Re-fetch documents to reflect updated status from backend
        // INTEGRATION PENDING (HIGH-BL1): After presigned upload API is live,
        // this will also trigger user profile refresh to update kycStatus → 'PENDING'
        void fetchDocuments();
      }
    } catch {
      addToast({
        message: "Server error during KYC submission.",
        variant: "error",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Derived state: Are all required documents in "uploaded" state?
  const allRequiredUploaded = documents.every(
    (d) => !d.required || d.status === "uploaded",
  );

  if (isLoading) {
    return (
      <div className="animate-in fade-in max-w-4xl mx-auto space-y-6">
        {/* Status Skeleton */}
        <div className="w-full h-32 bg-neutral-100 rounded-lg border border-neutral-200 animate-pulse"></div>

        {/* Header Skeleton */}
        <div className="space-y-2">
          <div className="h-6 w-48 bg-neutral-100 rounded animate-pulse"></div>
          <div className="h-4 w-64 bg-neutral-100 rounded animate-pulse"></div>
        </div>

        {/* List Skeleton */}
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="w-full h-24 bg-neutral-100 rounded-lg border border-neutral-200 animate-pulse"
            ></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto pb-20 md:pb-0 animate-in fade-in duration-300">
      <KycStatusCard
        status={currentKycStatus}
        onScrollToDocs={() => {
          document
            .getElementById("kyc-docs-section")
            ?.scrollIntoView({ behavior: "smooth" });
        }}
      />

      <div id="kyc-docs-section" className="mt-8">
        <h3 className="text-base font-semibold text-text-primary">
          Required Documents
        </h3>
        <p className="text-xs text-text-secondary mt-1 mb-6">
          Sab required documents upload karein — file chunne ke baad &quot;KYC
          Submit Karein&quot; dabayein.
        </p>

        {isError ? (
          // Graceful Failover Empty State (per user instructions)
          <div className="w-full border border-border-default rounded-lg p-8 bg-surface-card text-center flex flex-col items-center">
            <div className="w-12 h-12 bg-error-50 text-error-500 rounded-full flex items-center justify-center mb-3">
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
              </svg>
            </div>
            <h4 className="text-sm font-semibold text-text-primary mb-1">
              KYC Requirements Unavailable
            </h4>
            <p className="text-xs text-text-secondary max-w-sm mb-4">
              Hum abhi required documents ki list load nahi kar paaye. Common
              business verification documents mein{" "}
              <strong>GST Certificate</strong> aur <strong>PAN Card</strong>{" "}
              aate hain, par kripya list load hone tak wait karein.
            </p>
            <button
              onClick={fetchDocuments}
              className="px-4 py-2 bg-neutral-100 hover:bg-neutral-200 text-text-primary text-sm font-medium rounded-lg transition-colors"
            >
              Retry Loading Documents
            </button>
          </div>
        ) : documents.length === 0 ? (
          // Empty State
          <div className="w-full border border-border-default border-dashed rounded-lg p-8 bg-neutral-50 text-center">
            <p className="text-sm text-text-secondary">
              Koi document requirement list nahi mili.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {documents.map((doc) => (
              <DocumentUploadCard
                key={doc.id}
                doc={doc}
                onPreview={(url, filename, type) =>
                  setPreviewFile({ url, filename, type })
                }
                onUploadSuccess={handleUploadSuccess}
                disabled={isKycPendingOrVerified}
              />
            ))}
          </div>
        )}

        {/* Submit Button Section */}
        {!isError &&
          documents.length > 0 &&
          currentKycStatus !== "PENDING" &&
          currentKycStatus !== "VERIFIED" && (
            <div className="mt-8 border-t border-border-default pt-6">
              <button
                onClick={handleSubmit}
                disabled={!allRequiredUploaded || isSubmitting}
                className={`w-full h-12 rounded-xl text-base font-medium flex items-center justify-center transition-colors ${
                  !allRequiredUploaded
                    ? "bg-neutral-100 text-text-muted cursor-not-allowed"
                    : "bg-brand-600 hover:bg-brand-700 text-white shadow-1"
                }`}
                aria-disabled={!allRequiredUploaded}
                title={
                  !allRequiredUploaded
                    ? "Sab required documents upload karein"
                    : ""
                }
              >
                {isSubmitting ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin"></div>
                    <span>Submitting...</span>
                  </div>
                ) : (
                  <>
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      className="mr-2"
                    >
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                      <polyline points="22 4 12 14.01 9 11.01"></polyline>
                    </svg>
                    KYC Submit Karein
                  </>
                )}
              </button>
              {!allRequiredUploaded && (
                <p className="text-xs text-center text-text-muted mt-3">
                  Button enable karne ke liye sabhi *Zaroori documents upload
                  karein
                </p>
              )}
            </div>
          )}

        {/* Info text for pending/verified states */}
        {(currentKycStatus === "PENDING" ||
          currentKycStatus === "VERIFIED") && (
          <div className="mt-6 text-center">
            <p className="text-xs text-text-secondary">
              {currentKycStatus === "PENDING"
                ? "Documents pehle se review mein hain."
                : "KYC verified hai — re-submit ki zaroorat nahi."}
            </p>
          </div>
        )}
      </div>

      <DocumentPreviewModal
        isOpen={!!previewFile}
        onClose={() => setPreviewFile(null)}
        fileUrl={previewFile?.url || ""}
        filename={previewFile?.filename || ""}
        fileType={previewFile?.type}
      />
    </div>
  );
}
