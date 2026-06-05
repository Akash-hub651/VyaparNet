"use client";

import React, { useState } from "react";
import { useToast } from "../../../components/ui/Toast";
import { Button } from "../../../components/ui/Button";
import { useAuth } from "../../../app/contexts/auth.context";
import { submitSupportTicket, CreateSupportTicketPayload } from "../../../lib/api/support.client";

// --- Icons ---
function CheckCircle2Icon({ className }: { className?: string }) {
  return (
    <svg className={className} width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

function UploadIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

const SUBJECT_OPTIONS = [
  "Select karein",
  "Order se judi problem",
  "Product rejection",
  "KYC se judi problem",
  "Payout ya payment",
  "Account ya login issue",
  "Technical bug",
  "Doosra sawaal",
];

export function ContactForm() {
  const { addToast } = useToast();
  const { accessToken, user } = useAuth();
  
  const [subjectType, setSubjectType] = useState(SUBJECT_OPTIONS[0]);
  const [referenceId, setReferenceId] = useState("");
  const [message, setMessage] = useState("");
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [ticketId, setTicketId] = useState("");

  const [messageError, setMessageError] = useState("");
  const [subjectError, setSubjectError] = useState("");

  const isOrderOrProductIssue = subjectType === "Order se judi problem" || subjectType === "Product rejection";

  const handleMessageChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(e.target.value);
    if (messageError) {
      if (e.target.value.length >= 20) setMessageError("");
    }
  };

  const handleMessageBlur = () => {
    if (message.length > 0 && message.length < 20) {
      setMessageError("Ye field zaroori hai — thoda detail dein");
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!["image/jpeg", "image/png"].includes(file.type)) {
      addToast({ variant: "error", message: "Sirf JPG aur PNG allowed hain" });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      addToast({ variant: "error", message: "File size 5MB se chhota hona chahiye" });
      return;
    }
    setScreenshotFile(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    let hasError = false;
    if (subjectType === "Select karein") {
      setSubjectError("Kripya sahi sawaal ka type chunein");
      hasError = true;
    } else {
      setSubjectError("");
    }

    if (message.length < 20) {
      setMessageError("Ye field zaroori hai — thoda detail dein (min 20 chars)");
      hasError = true;
    }

    if (hasError) return;

    setIsSubmitting(true);

    try {
      /**
       * INTEGRATION PENDING: MEDIUM-BL3
       * Screenshot upload requires: POST /seller/support/screenshot-upload-url
       * → returns { uploadUrl, key }
       * → then PUT uploadUrl with file
       * → then include { screenshotUrl: key } in ticket payload
       *
       * Until this endpoint exists: submit ticket without screenshotUrl.
       * File is collected client-side for UX but NOT fabricated as a URL.
       */
      const payload: CreateSupportTicketPayload = {
        subjectType,
        message,
        ...(isOrderOrProductIssue && referenceId ? { referenceId } : {}),
        // screenshotUrl intentionally omitted — INTEGRATION PENDING (MEDIUM-BL3)
      };

      const result = await submitSupportTicket(payload, accessToken || "");

      if (result.success && result.data) {
        setTicketId(result.data.ticketId);
        setIsSuccess(true);
      } else {
        addToast({ variant: "error", message: !result.success && result.error ? result.error : "Message send nahi ho paya. Dobara try karein." });
      }
    } catch {
      // API client catches fetch errors, but fallback just in case
      addToast({ variant: "error", message: "Message send nahi ho paya. Dobara try karein." });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSuccess) {
    return (
      <div className="bg-surface-card border border-border-default rounded-xl p-8 text-center flex flex-col items-center">
        <div className="text-success-500 mb-4 animate-[scaleIn_300ms_ease-out]">
          <CheckCircle2Icon />
        </div>
        <h3 className="text-lg font-semibold text-text-primary mb-2">Message mila! 🙏</h3>
        <p className="text-sm text-text-secondary leading-relaxed mb-6">
          Ticket #{ticketId || "TICKET-12345"} raise ho gayi.<br />
          24 ghante mein {user?.email || "aapke registered email"} pe jawab milega.
        </p>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-text-muted">Wapas:</span>
          <button 
            onClick={() => {
              setIsSuccess(false);
              setMessage("");
              setSubjectType("Select karein");
              setReferenceId("");
              setScreenshotFile(null);
            }}
            className="text-brand-600 font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded"
          >
            Help & Support pe jaiye
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-surface-card border border-border-default rounded-xl overflow-hidden">
      <div className="px-6 py-5 border-b border-border-default bg-surface-header">
        <h2 className="text-base font-semibold text-text-primary">Koi aur sawaal hai?</h2>
        <p className="text-sm text-text-secondary mt-1">Hamari team se sampark karein. 24 ghante mein jawab milega.</p>
      </div>

      <form onSubmit={handleSubmit} className="p-6 space-y-5">
        {/* Subject Type */}
        <div className="space-y-1.5">
          <label htmlFor="subjectType" className="block text-sm font-medium text-text-primary">
            Sawaal ka type <span className="text-error-500">*</span>
          </label>
          <select
            id="subjectType"
            value={subjectType}
            onChange={(e) => setSubjectType(e.target.value)}
            className="w-full h-11 px-3 bg-surface-app border border-border-default rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 appearance-none"
            aria-invalid={!!subjectError}
            aria-describedby={subjectError ? "subjectError" : undefined}
          >
            {SUBJECT_OPTIONS.map((opt) => (
              <option key={opt} value={opt} disabled={opt === "Select karein"}>
                {opt}
              </option>
            ))}
          </select>
          {/* Custom generic Chevron */}
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-text-muted mt-7">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9" /></svg>
          </div>
          {subjectError && <p id="subjectError" role="alert" className="text-xs text-error-600">{subjectError}</p>}
        </div>

        {/* Conditional Reference ID */}
        {isOrderOrProductIssue && (
          <div className="space-y-1.5 animate-[fadeIn_200ms_ease]">
            <label htmlFor="referenceId" className="block text-sm font-medium text-text-primary">
              Order # ya Product # <span className="text-text-muted font-normal">(optional)</span>
            </label>
            <input
              id="referenceId"
              type="text"
              value={referenceId}
              onChange={(e) => setReferenceId(e.target.value)}
              placeholder="VN-00456 ya product ka naam"
              className="w-full h-11 px-3 bg-surface-app border border-border-default rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
            />
            <p className="text-xs text-text-secondary">Jaldi resolve karne mein help karega</p>
          </div>
        )}

        {/* Message Textarea */}
        <div className="space-y-1.5">
          <div className="flex justify-between items-end">
            <label htmlFor="message" className="block text-sm font-medium text-text-primary">
              Apni problem detail mein likhein <span className="text-error-500">*</span>
            </label>
            <span className={`text-xs ${message.length > 1000 ? "text-error-600" : "text-text-muted"}`}>
              {message.length} / 1000
            </span>
          </div>
          <textarea
            id="message"
            rows={5}
            maxLength={1000}
            value={message}
            onChange={handleMessageChange}
            onBlur={handleMessageBlur}
            placeholder="Jitna zyada detail denge, utni jaldi solve hogi"
            className="w-full p-3 bg-surface-app border border-border-default rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 resize-y"
            aria-invalid={!!messageError}
            aria-describedby={messageError ? "messageError" : undefined}
          />
          {messageError && <p id="messageError" role="alert" className="text-xs text-error-600">{messageError}</p>}
        </div>

        {/* File Upload (Compact) */}
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-text-primary">
            Screenshot <span className="text-text-muted font-normal">(optional)</span>
          </label>
          <div className="relative border border-dashed border-border-strong rounded-lg bg-surface-app flex items-center px-4 h-[60px] hover:border-brand-500 transition-colors cursor-pointer focus-within:ring-2 focus-within:ring-brand-500">
            <input
              type="file"
              accept=".jpg,.jpeg,.png"
              onChange={handleFileChange}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              aria-label="Upload screenshot"
            />
            <div className="flex items-center gap-3 w-full">
              <div className="w-8 h-8 rounded bg-brand-50 text-brand-600 flex items-center justify-center shrink-0">
                <UploadIcon />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-text-primary truncate">
                  {screenshotFile ? screenshotFile.name : "Click to upload"}
                </p>
                <p className="text-xs text-text-secondary truncate">
                  {screenshotFile ? `${(screenshotFile.size / 1024).toFixed(1)} KB` : "JPG, PNG (max 5MB)"}
                </p>
              </div>
              {screenshotFile && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    setScreenshotFile(null);
                  }}
                  className="p-1.5 text-text-muted hover:text-error-600 rounded"
                  aria-label="Remove file"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                </button>
              )}
            </div>
          </div>
          <p className="text-xs text-text-secondary">Problem ka screenshot attach karo toh jaldi samjhenge</p>
        </div>

        <div className="pt-2">
          <Button type="submit" isLoading={isSubmitting} className="w-full">
            {isSubmitting ? "Bhej rahe hain..." : "➤ Message Bhejein"}
          </Button>
        </div>
      </form>
    </div>
  );
}
