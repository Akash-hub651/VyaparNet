'use client';

/**
 * ErrorBanner — components/ui/ErrorBanner.tsx
 *
 * Authority: seller_dashboard_screen_system.md §G.6, §18 (Error State System)
 *
 * Rules:
 * - Red error alert with dismiss button
 * - Message must be actionable Hinglish — never raw stack traces (INVARIANT-UX-7)
 * - Optional retry callback
 * - Always paired with icon (never color-only — RULE C-1)
 */

import React from 'react';

export interface ErrorBannerProps {
  /** Hinglish error message — actionable, never a raw stack trace */
  message: string;
  /** Optional retry callback — shows "Phir try karein" button */
  onRetry?: () => void;
  /** Optional dismiss callback */
  onDismiss?: () => void;
  /** Additional class names */
  className?: string;
}

export function ErrorBanner({
  message,
  onRetry,
  onDismiss,
  className = '',
}: ErrorBannerProps): React.JSX.Element {
  return (
    <div
      role="alert"
      aria-live="assertive"
      className={[
        'flex items-start gap-3 px-4 py-3 rounded-lg',
        'bg-error-50 border border-error-100',
        className,
      ].join(' ')}
    >
      {/* Error icon */}
      <span aria-hidden="true" className="flex-shrink-0 mt-0.5 text-error-500">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </span>

      {/* Message + actions */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-error-700 leading-5">{message}</p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="mt-1.5 text-xs font-semibold text-error-700 underline underline-offset-2 hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-error-500 focus-visible:ring-offset-1 rounded"
          >
            Phir try karein
          </button>
        )}
      </div>

      {/* Dismiss button */}
      {onDismiss && (
        <button
          onClick={onDismiss}
          aria-label="Error dismiss karein"
          className="flex-shrink-0 text-error-500 hover:text-error-700 transition-colors p-0.5"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      )}
    </div>
  );
}

/* ── INFO BANNER ─────────────────────────────────────────────── */
export interface InfoBannerProps {
  message: string;
  onDismiss?: () => void;
  variant?: 'info' | 'warning';
  className?: string;
}

export function InfoBanner({
  message,
  onDismiss,
  variant = 'info',
  className = '',
}: InfoBannerProps): React.JSX.Element {
  const isWarning = variant === 'warning';
  return (
    <div
      role="note"
      className={[
        'flex items-start gap-3 px-4 py-3 rounded-lg border',
        isWarning ? 'bg-warning-50 border-warning-100' : 'bg-info-50 border-info-100',
        className,
      ].join(' ')}
    >
      <span aria-hidden="true" className={`flex-shrink-0 mt-0.5 ${isWarning ? 'text-warning-500' : 'text-info-500'}`}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
      </span>
      <p className={`flex-1 text-sm font-medium leading-5 ${isWarning ? 'text-warning-700' : 'text-info-700'}`}>
        {message}
      </p>
      {onDismiss && (
        <button
          onClick={onDismiss}
          aria-label="Dismiss"
          className={`flex-shrink-0 transition-colors p-0.5 ${isWarning ? 'text-warning-500 hover:text-warning-700' : 'text-info-500 hover:text-info-700'}`}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      )}
    </div>
  );
}

/* ── SUSPENDED ACCOUNT BANNER ────────────────────────────────── */
/* Authority: screen_system §G.4 — Full-width red banner when isSuspended */
export function SuspendedBanner(): React.JSX.Element {
  return (
    <div
      role="alert"
      aria-live="assertive"
      className="w-full bg-error-600 text-white px-4 py-2 flex items-center gap-2 text-sm font-medium"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
      Aapka account temporarily suspend hai. Koi bhi action available nahi hai.&nbsp;
      <a
        href="mailto:support@vyaparnet.com"
        className="underline font-semibold hover:no-underline"
      >
        Support se contact karein: support@vyaparnet.com
      </a>
    </div>
  );
}
