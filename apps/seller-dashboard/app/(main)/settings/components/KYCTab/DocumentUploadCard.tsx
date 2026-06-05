import React, { useState, useRef } from "react";
import { KycDocumentConfig } from "../../../../../lib/api/settings.client";
import { useToast } from "../../../../../components/ui/Toast";

/**
 * DocumentUploadCard — KYCTab sub-component
 *
 * Authority: seller_dashboard_screen_system.md §16 (KYC Settings)
 *            seller_dashboard_architecture.md §4 "Integration Pending Policy"
 *
 * HIGH-BL1 FIX — Removed fake client-side DataURL simulation.
 *
 * INTEGRATION PENDING:
 *   Real upload flow requires: POST /seller/kyc/documents/{docId}/upload-url
 *   → returns { uploadUrl: string, key: string }
 *   → then: PUT uploadUrl with file (S3 presigned PUT)
 *   → then: POST /seller/kyc/documents/{docId}/confirm { key }
 *
 *   These endpoints are NOT yet confirmed in Sprint 8 backend.
 *   Until they exist: show file selection + "Ready to Submit" state.
 *   The file is held in component state — no DataURL submitted to backend.
 *
 * WHAT THIS COMPONENT DOES (post-fix):
 *   1. Validates file size and type client-side (safe)
 *   2. Shows selected file name + size as "Ready" state
 *   3. Calls onUploadSuccess ONLY with file metadata (no url field — blank sentinel)
 *   4. KYCTab.handleSubmit will bundle file refs when presigned API is live
 *
 * WHAT THIS COMPONENT DOES NOT DO (post-fix):
 *   ❌ No FileReader.readAsDataURL
 *   ❌ No fake progress bar simulation
 *   ❌ No Math.random() progress increments
 *   ❌ No DataURL submitted to backend
 */

interface DocumentUploadCardProps {
  doc: KycDocumentConfig;
  onPreview: (fileUrl: string, filename: string, fileType?: string) => void;
  onUploadSuccess: (
    docId: string,
    fileData: { id: string; filename: string; url: string; sizeBytes: number },
  ) => void;
  disabled?: boolean;
}

export function DocumentUploadCard({
  doc,
  onPreview,
  onUploadSuccess,
  disabled,
}: DocumentUploadCardProps) {
  const { addToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (disabled) return;
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (disabled) return;
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const processFile = (file: File) => {
    // 1. Size Validation
    const sizeInMB = file.size / (1024 * 1024);
    if (sizeInMB > doc.maxSizeMB) {
      addToast({
        message: `File size ${doc.maxSizeMB}MB se choti honi chahiye`,
        variant: "error",
      });
      return;
    }

    // 2. File selected — hold in state
    setSelectedFile(file);

    /**
     * INTEGRATION PENDING: HIGH-BL1
     * When POST /seller/kyc/documents/{docId}/upload-url is live:
     *   - Call getKycDocumentUploadUrl(doc.id, file.name, file.type, accessToken)
     *   - PUT to uploadUrl with file body
     *   - Call confirmKycDocumentUpload(doc.id, key, accessToken)
     *   - Then call onUploadSuccess with the confirmed key
     *
     * For now: notify parent that a file is selected (no actual upload).
     * The url field is intentionally empty — backend will assign real URL.
     */
    onUploadSuccess(doc.id, {
      id: `pending_${doc.id}`,
      filename: file.name,
      url: "", // INTEGRATION PENDING: will be S3 URL after upload
      sizeBytes: file.size,
    });

    addToast({
      message: `${doc.name}: File chuni gayi. Submit karein.`,
      variant: "success",
    });
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div
      className={`w-full bg-surface-card border border-border-default rounded-lg p-4 mb-3 flex flex-col md:flex-row gap-4 transition-colors ${dragActive ? "border-brand-500 bg-brand-50/30" : ""}`}
      role="region"
      aria-label={`${doc.name} upload area`}
    >
      {/* LEFT: Document Info */}
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-1">
          <h4 className="text-sm font-semibold text-text-primary">
            {doc.name}{" "}
            {doc.nameHindi && (
              <span className="font-normal text-text-secondary">
                ({doc.nameHindi})
              </span>
            )}
          </h4>
          {doc.required && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-error-100 text-error-700">
              * Zaroori
            </span>
          )}
        </div>
        <p className="text-xs text-text-secondary mb-2">{doc.description}</p>
        <p className="text-xs text-text-muted">
          Accepted: {doc.acceptedFormats.join(", ")} &middot; Max{" "}
          {doc.maxSizeMB}MB
        </p>

        {doc.status === "rejected" && doc.rejectionReason && (
          <div className="mt-2 text-xs font-medium text-error-700 bg-error-50 px-2 py-1.5 rounded border border-error-200 inline-block">
            Reason: {doc.rejectionReason}
          </div>
        )}
      </div>

      {/* RIGHT: Upload Area or Status */}
      <div className="w-full md:w-64 flex-shrink-0 flex flex-col justify-center">
        {/* State: File Selected (Ready to Submit) */}
        {selectedFile && !disabled && (
          <div
            className="w-full border border-success-300 rounded-lg p-3 bg-success-50 flex items-center gap-3"
            aria-live="polite"
          >
            <div className="w-10 h-10 rounded border border-success-200 bg-success-100 flex-shrink-0 flex items-center justify-center">
              {selectedFile.name.toLowerCase().endsWith(".pdf") ? (
                <span className="text-error-500 font-bold text-xs">PDF</span>
              ) : (
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="text-success-600"
                  aria-hidden="true"
                >
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-0.5">
                <span
                  className="w-1.5 h-1.5 rounded-full bg-success-500 flex-shrink-0"
                  aria-hidden="true"
                />
                <p className="text-xs font-medium text-success-800">
                  File Ready
                </p>
              </div>
              <p className="text-[10px] text-text-muted truncate">
                {selectedFile.name}
              </p>
              <p className="text-[10px] text-text-muted">
                {formatSize(selectedFile.size)}
              </p>
            </div>
            {/* Replace action */}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex-shrink-0 text-[10px] font-medium text-brand-600 hover:text-brand-800 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded"
              aria-label={`Replace ${doc.name}`}
            >
              Replace
            </button>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept={doc.acceptedFormats
                .map((f) => `.${f.toLowerCase()}`)
                .join(",")}
              onChange={handleChange}
              disabled={disabled}
            />
          </div>
        )}

        {/* State: Existing server file (from API) */}
        {!selectedFile && doc.status === "uploaded" && doc.currentFile && (
          <div
            className="w-full border border-border-default rounded-lg p-3 bg-surface-base flex items-center gap-3 relative overflow-hidden"
            aria-live="polite"
          >
            <div className="w-12 h-12 rounded border border-border-default bg-neutral-100 flex-shrink-0 flex items-center justify-center overflow-hidden">
              {doc.currentFile.filename.toLowerCase().endsWith(".pdf") ? (
                <span className="text-error-500 font-bold text-xs">PDF</span>
              ) : (
                <img
                  src={doc.currentFile.url}
                  alt="thumbnail"
                  className="w-full h-full object-cover"
                />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-0.5">
                <span
                  className="w-1.5 h-1.5 rounded-full bg-success-500 flex-shrink-0"
                  aria-hidden="true"
                />
                <p className="text-xs font-medium text-text-primary truncate">
                  Uploaded
                </p>
              </div>
              <p className="text-[10px] text-text-muted truncate">
                {doc.currentFile.filename}
              </p>
              <p className="text-[10px] text-text-muted">
                {formatSize(doc.currentFile.sizeBytes)}
              </p>
            </div>
            <div className="absolute right-2 top-2 bottom-2 flex flex-col justify-center gap-1 bg-surface-base pl-2">
              {doc.currentFile.url && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onPreview(doc.currentFile!.url, doc.currentFile!.filename);
                  }}
                  className="flex items-center gap-1.5 px-2 py-1 bg-neutral-50 hover:bg-neutral-100 text-[10px] font-medium text-text-secondary rounded transition-colors"
                  aria-label="Preview document"
                >
                  Preview
                </button>
              )}
              {!disabled && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    fileInputRef.current?.click();
                  }}
                  className="flex items-center gap-1.5 px-2 py-1 bg-neutral-50 hover:bg-neutral-100 text-[10px] font-medium text-text-secondary rounded transition-colors"
                  aria-label="Replace document"
                >
                  Replace
                </button>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept={doc.acceptedFormats
                .map((f) => `.${f.toLowerCase()}`)
                .join(",")}
              onChange={handleChange}
              disabled={disabled}
            />
          </div>
        )}

        {/* State: Not Uploaded OR Rejected (needs upload) */}
        {!selectedFile &&
          (doc.status === "not_uploaded" || doc.status === "rejected") && (
            <div
              className={`relative w-full border-2 border-dashed rounded-lg p-3 h-20 md:h-[80px] flex items-center justify-center transition-colors cursor-pointer group ${
                disabled
                  ? "border-border-default bg-neutral-50 cursor-not-allowed opacity-60"
                  : dragActive
                    ? "border-brand-500 bg-brand-50"
                    : doc.status === "rejected"
                      ? "border-error-300 bg-error-50/50 hover:bg-error-50"
                      : "border-border-default bg-neutral-50 hover:bg-neutral-100"
              }`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              onClick={() => !disabled && fileInputRef.current?.click()}
              role="button"
              aria-label={`${doc.name} upload karein`}
              tabIndex={disabled ? -1 : 0}
              onKeyDown={(e) => {
                if (!disabled && (e.key === "Enter" || e.key === " ")) {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept={doc.acceptedFormats
                  .map((f) => `.${f.toLowerCase()}`)
                  .join(",")}
                onChange={handleChange}
                disabled={disabled}
              />
              <div className="flex flex-col items-center justify-center text-center">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className={`mb-1 ${doc.status === "rejected" ? "text-error-500" : "text-neutral-500 group-hover:text-brand-600 transition-colors"}`}
                  aria-hidden="true"
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                <span
                  className={`text-xs font-medium ${doc.status === "rejected" ? "text-error-600" : "text-text-secondary group-hover:text-brand-600 transition-colors"}`}
                >
                  {doc.status === "rejected"
                    ? "Dobara Upload Karein"
                    : "File chunein"}
                </span>
              </div>
            </div>
          )}
      </div>
    </div>
  );
}
