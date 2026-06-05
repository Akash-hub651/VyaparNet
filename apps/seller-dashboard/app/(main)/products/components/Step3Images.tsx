"use client";

import React, { useRef, useState } from "react";
import Image from "next/image";
import { DraftData } from "./types";
import { uploadProductMedia } from "../../../../lib/api/media.client";
import { useAuth } from "../../../../app/contexts/auth.context";

interface Step3Props {
  draft: DraftData;
  updateDraft: (key: keyof DraftData, value: any) => void;
}

export function Step3Images({
  draft,
  updateDraft,
}: Step3Props): React.JSX.Element {
  const { accessToken } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>(
    {},
  );
  const [uploadErrors, setUploadErrors] = useState<Record<string, string>>({});
  const [pendingDeleteIndex, setPendingDeleteIndex] = useState<number | null>(null);

  const handleFileSelect = async (files: FileList) => {
    if (!accessToken) return;

    for (const file of Array.from(files)) {
      if (file.size > 5 * 1024 * 1024) {
        setUploadErrors((prev) => ({
          ...prev,
          [file.name]: "File size exceeds 5MB limit",
        }));
        continue;
      }

      const tempId = `${file.name}-${Date.now()}`;
      setUploadProgress((p) => ({ ...p, [tempId]: 0 }));
      setUploadErrors((prev) => {
        const copy = { ...prev };
        delete copy[file.name];
        return copy;
      });

      try {
        const result = await uploadProductMedia(file, accessToken, (pct) => {
          setUploadProgress((p) => ({ ...p, [tempId]: pct }));
        });

        // Success
        
        updateDraft('media', [
          ...(draft.media || []),
          {
            mediaId: result.id,
            url: result.url,
            mediaClass: "PRODUCT_IMAGE",
            name: file.name,
          },
        ]);

        setUploadProgress((p) => {
          const copy = { ...p };
          delete copy[tempId];
          return copy;
        });
      } catch (err) {
        console.error("Upload failed:", err);
        setUploadErrors((prev) => ({
          ...prev,
          [file.name]: err instanceof Error ? err.message : "Upload failed",
        }));
        setUploadProgress((p) => {
          const copy = { ...p };
          delete copy[tempId];
          return copy;
        });
      }
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files.length > 0) {
      void handleFileSelect(e.dataTransfer.files);
    }
  };

  return (
    <div className="space-y-8">
      {/* Upload Area */}
      <fieldset>
        <legend className="text-base font-semibold text-text-primary mb-2">
          Product Images
        </legend>
        <p className="text-sm text-text-secondary mb-4">
          Upload product photos.{" "}
          <strong className="font-medium text-text-primary">
            At least 1 photo
          </strong>{" "}
          is required to submit for review.
        </p>

        <div
          role="button"
          tabIndex={0}
          aria-label="Product photos upload karein"
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          className="h-[80px] sm:h-[120px] w-full border-2 border-dashed border-neutral-300 rounded-xl bg-neutral-50 flex flex-col items-center justify-center cursor-pointer hover:bg-neutral-100 hover:border-neutral-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 transition-colors"
        >
          <div className="flex items-center gap-2 mb-1">
            <svg
              className="w-6 h-6 text-neutral-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
              />
            </svg>
            <p className="text-sm font-medium text-text-primary">
              Photos yahan drag karein ya{" "}
              <span className="text-brand-600 underline">click karein</span>
            </p>
          </div>
          <p className="text-xs text-text-secondary">
            JPG, PNG, WebP · Max 5MB per photo · Up to 5 photos
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files) void handleFileSelect(e.target.files);
              e.target.value = "";
            }}
          />
        </div>

        {/* Upload Progress & Errors */}
        <div className="mt-4 space-y-3">
          {Object.entries(uploadProgress).map(([tempId, pct]) => (
            <div key={tempId} className="flex items-center gap-3">
              <div className="flex-1 bg-neutral-100 rounded-full h-1.5 overflow-hidden">
                <div
                  className="h-full bg-brand-500 transition-all duration-200"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="text-xs text-text-secondary shrink-0 w-10 text-right">
                {pct}%
              </span>
            </div>
          ))}
          {Object.entries(uploadErrors).map(([fileName, errorMsg]) => (
            <div
              key={fileName}
              className="text-xs text-error-600 flex items-center gap-1.5"
              role="alert"
            >
              <svg
                className="w-3.5 h-3.5 shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <span>
                {fileName}: {errorMsg}
              </span>
            </div>
          ))}
        </div>

        {/* Uploaded Grid */}
        {draft.media?.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6">
            {draft.media.map((media, index) => (
              <div
                key={media.mediaId}
                className="relative group aspect-square rounded-md border border-neutral-200 overflow-hidden bg-neutral-50"
              >
                <Image
                  src={media.url}
                  alt={media.name}
                  fill
                  className="object-cover"
                />
                {index === 0 && (
                  <div className="absolute top-1 left-1 bg-brand-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide z-10">
                    Main Photo
                  </div>
                )}
                
                {pendingDeleteIndex === index ? (
                  <div className="absolute inset-0 bg-error-500/80 flex flex-col items-center justify-center z-20">
                     <span className="text-white text-xs font-semibold mb-2">Hataoge?</span>
                     <div className="flex gap-2">
                       <button
                         type="button"
                         onClick={() => setPendingDeleteIndex(null)}
                         className="px-2 py-1 bg-white text-error-700 text-[10px] font-bold rounded"
                       >
                         Nahi
                       </button>
                       <button
                         type="button"
                         onClick={() => {
                           updateDraft('media', draft.media.filter((_, i) => i !== index) as any);
                           setPendingDeleteIndex(null);
                         }}
                         className="px-2 py-1 bg-error-700 text-white text-[10px] font-bold rounded border border-error-600"
                       >
                         Haan, Hatao
                       </button>
                     </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setPendingDeleteIndex(index)}
                    className="absolute top-1 right-1 w-6 h-6 bg-error-500 text-white rounded-full flex items-center justify-center opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-error-500 z-10"
                    aria-label={`Remove image ${media.name}`}
                  >
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
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </fieldset>
    </div>
  );
}
