'use client';

/**
 * Toast Notification System — components/ui/Toast.tsx
 *
 * Authority: seller_dashboard_screen_system.md §G.6
 *
 * Rules:
 * - Position: top-right (desktop), top-center (mobile)
 * - Max 3 visible at once (FIFO queue — oldest dismissed first)
 * - Auto-dismiss: 4000ms (success/info), 6000ms (warning), manual only (error)
 * - z-index: 70 (above modals at z-60, above everything)
 * - Width: 320px desktop, 90vw mobile
 * - Shadow: shadow-2
 * - Border-left: 3px colored
 * - Stack: newest on top
 */

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

/* ── TYPES ───────────────────────────────────────────────────── */
export type ToastVariant = 'success' | 'error' | 'warning' | 'info';

export interface ToastItem {
  id: string;
  variant: ToastVariant;
  message: string;
  duration?: number; // ms — 0 = manual only
}

interface ToastContextValue {
  addToast: (toast: Omit<ToastItem, 'id'>) => void;
  removeToast: (id: string) => void;
}

/* ── CONTEXT ─────────────────────────────────────────────────── */
const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

/* ── VARIANT CONFIG ──────────────────────────────────────────── */
const VARIANT_CONFIG: Record<ToastVariant, {
  bg: string; text: string; border: string; icon: React.ReactNode;
}> = {
  success: {
    bg: 'bg-success-50', text: 'text-success-700', border: 'border-l-success-500',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
      </svg>
    ),
  },
  error: {
    bg: 'bg-error-50', text: 'text-error-700', border: 'border-l-error-500',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
      </svg>
    ),
  },
  warning: {
    bg: 'bg-warning-50', text: 'text-warning-700', border: 'border-l-warning-500',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    ),
  },
  info: {
    bg: 'bg-info-50', text: 'text-info-700', border: 'border-l-info-500',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
      </svg>
    ),
  },
};

/* ── DEFAULT DURATIONS ───────────────────────────────────────── */
const DEFAULT_DURATION: Record<ToastVariant, number> = {
  success: 4000,
  info:    4000,
  warning: 6000,
  error:   0,  // manual dismiss only
};

/* ── SINGLE TOAST ITEM ───────────────────────────────────────── */
function ToastCard({
  toast,
  onRemove,
}: {
  toast: ToastItem;
  onRemove: (id: string) => void;
}): React.JSX.Element {
  const cfg = VARIANT_CONFIG[toast.variant];
  const duration = toast.duration !== undefined ? toast.duration : DEFAULT_DURATION[toast.variant];

  useEffect(() => {
    if (duration === 0) return;
    const t = setTimeout(() => onRemove(toast.id), duration);
    return () => clearTimeout(t);
  }, [toast.id, duration, onRemove]);

  return (
    <div
      role="alert"
      aria-live="polite"
      aria-atomic="true"
      className={[
        'flex items-start gap-3 p-4 rounded-lg shadow-2',
        'border-l-4 w-[320px] max-w-[90vw]',
        'animate-toast-in',
        cfg.bg, cfg.text, cfg.border,
      ].join(' ')}
    >
      <span aria-hidden="true" className="flex-shrink-0 mt-0.5">{cfg.icon}</span>
      <p className="flex-1 text-sm font-medium leading-5">{toast.message}</p>
      <button
        onClick={() => onRemove(toast.id)}
        aria-label="Notification band karein"
        className="flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity -mt-1 -mr-1 p-1"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}

/* ── TOAST CONTAINER ─────────────────────────────────────────── */
function ToastContainer({ toasts, removeToast }: {
  toasts: ToastItem[];
  removeToast: (id: string) => void;
}): React.JSX.Element | null {
  if (toasts.length === 0) return null;
  return (
    <div
      aria-label="Notifications"
      className={[
        'fixed z-[70] flex flex-col gap-2',
        /* Desktop: top-right; Mobile: top-center */
        'top-4 right-4 sm:right-4',
        'left-4 sm:left-auto',
      ].join(' ')}
    >
      {toasts.map((t) => (
        <ToastCard key={t.id} toast={t} onRemove={removeToast} />
      ))}
    </div>
  );
}

/* ── PROVIDER ────────────────────────────────────────────────── */
export function ToastProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const counterRef = useRef(0);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback((toast: Omit<ToastItem, 'id'>) => {
    const id = `toast-${++counterRef.current}`;
    setToasts((prev) => {
      // Max 3 — drop oldest if needed
      const next = [...prev, { ...toast, id }];
      return next.length > 3 ? next.slice(next.length - 3) : next;
    });
  }, []);

  return (
    <ToastContext.Provider value={{ addToast, removeToast }}>
      {children}
      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </ToastContext.Provider>
  );
}

/* ── SHORTHAND HELPERS ───────────────────────────────────────── */
/* Usage: const { toast } = useToast(); toast.success('Done!') */
export function createToastHelpers(addToast: ToastContextValue['addToast']) {
  return {
    success: (message: string) => addToast({ variant: 'success', message }),
    error:   (message: string) => addToast({ variant: 'error',   message }),
    warning: (message: string) => addToast({ variant: 'warning', message }),
    info:    (message: string) => addToast({ variant: 'info',    message }),
  };
}
