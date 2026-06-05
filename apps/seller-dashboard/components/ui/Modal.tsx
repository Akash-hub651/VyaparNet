'use client';

/**
 * Modal System — components/ui/Modal.tsx
 *
 * Authority: seller_dashboard_screen_system.md §G.14
 *   G.14.1 — ConfirmDialog (destructive/irreversible actions)
 *   G.14.2 — FormModal (forms in overlay)
 *   G.14.3 — BottomSheet (mobile, auto-converts FormModal on < 768px)
 *   G.14.4 — Global modal rules
 *
 * Rules enforced here:
 * - NEVER: modal inside modal
 * - ALWAYS: focus trap, Escape closes, scroll lock on body
 * - z-index: 60 (above sidebar z-30, above drawer z-50)
 * - Open: 150ms scale, Close: 100ms fade
 * - ConfirmDialog: focus on Cancel first (safer default)
 * - FormModal: focus on first input field
 * - Scroll lock: body.style.overflow = hidden on open
 */

import React, { useEffect, useRef, useCallback } from 'react';
import { Button } from './Button';

/* ── FOCUS TRAP HOOK ─────────────────────────────────────────── */
function useFocusTrap(containerRef: React.RefObject<HTMLElement | null>, active: boolean): void {
  useEffect(() => {
    if (!active || !containerRef.current) return;
    const el = containerRef.current;
    const focusable = el.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Tab') return;
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last?.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    }

    el.addEventListener('keydown', handleKeyDown);
    first?.focus();
    return () => el.removeEventListener('keydown', handleKeyDown);
  }, [active, containerRef]);
}

/* ── SCROLL LOCK HOOK ────────────────────────────────────────── */
function useScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [active]);
}

/* ── OVERLAY ─────────────────────────────────────────────────── */
function Overlay({ onClick }: { onClick?: () => void }) {
  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 bg-black/40 backdrop-blur-sm z-60 animate-[fadeIn_150ms_ease]"
      onClick={onClick}
    />
  );
}

/* ════════════════════════════════════════════════════════════════
   CONFIRM DIALOG — G.14.1
   ════════════════════════════════════════════════════════════════ */
export interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  /** Dialog title (h2) */
  title: string;
  /** Body description (max 2 lines per spec) */
  description?: string;
  /** Warning note with alert triangle (for destructive) */
  warning?: string;
  /** Confirm button label */
  confirmLabel?: string;
  /** Cancel button label */
  cancelLabel?: string;
  /** Confirm button variant — destructive for irreversible actions */
  confirmVariant?: 'primary' | 'destructive';
  /** Whether confirm action is in progress */
  isConfirming?: boolean;
}

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  warning,
  confirmLabel = 'Haan, Karein',
  cancelLabel = 'Nahi, Wapas Jaiye',
  confirmVariant = 'destructive',
  isConfirming = false,
}: ConfirmDialogProps): React.JSX.Element | null {
  const containerRef = useRef<HTMLDivElement>(null);
  const titleId = 'confirm-dialog-title';
  const descId = 'confirm-dialog-desc';

  useFocusTrap(containerRef, isOpen);
  useScrollLock(isOpen);

  const handleEscape = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape' && isOpen) onClose();
  }, [isOpen, onClose]);

  useEffect(() => {
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [handleEscape]);

  if (!isOpen) return null;

  return (
    <>
      <Overlay onClick={onClose} />
      <div
        className="fixed inset-0 z-60 flex items-center justify-center p-4"
        aria-hidden="false"
      >
        <div
          ref={containerRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={description ? descId : undefined}
          className="bg-surface-card rounded-xl shadow-3 w-full max-w-modal-sm animate-modal-in relative"
        >
          {/* Header */}
          <div className="flex items-start justify-between p-6 pb-4">
            <h2 id={titleId} className="text-lg font-semibold text-text-primary pr-8 leading-tight">
              {title}
            </h2>
            <button
              onClick={onClose}
              aria-label="Modal band karein"
              className="absolute top-4 right-4 p-1.5 text-text-muted hover:text-text-primary rounded-md hover:bg-surface-hover transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* Body */}
          <div className="px-6 pb-4 space-y-3">
            {description && (
              <p id={descId} className="text-sm text-text-secondary leading-relaxed">{description}</p>
            )}
            {warning && (
              <div className="flex items-start gap-2 text-error-700">
                <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                <p className="text-xs">{warning}</p>
              </div>
            )}
          </div>

          {/* Footer — Cancel first (Tab order: Cancel → Confirm per spec) */}
          <div className="flex gap-3 justify-end px-6 py-4 border-t border-border-default">
            <Button variant="ghost" onClick={onClose} disabled={isConfirming}>
              {cancelLabel}
            </Button>
            <Button
              variant={confirmVariant}
              onClick={onConfirm}
              isLoading={isConfirming}
              className="min-w-[100px]"
            >
              {confirmLabel}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}

/* ════════════════════════════════════════════════════════════════
   FORM MODAL — G.14.2
   ════════════════════════════════════════════════════════════════ */
export interface FormModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  /** Size variant. Default: md (560px) */
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
  /** Footer buttons — if undefined, no footer rendered (for custom footers) */
  footer?: React.ReactNode;
  /** Whether to show back button (←) in header */
  showBack?: boolean;
  onBack?: () => void;
}

const MODAL_SIZE_MAP = { sm: 'max-w-modal-sm', md: 'max-w-modal-md', lg: 'max-w-modal-lg' } as const;

export function FormModal({
  isOpen,
  onClose,
  title,
  size = 'md',
  children,
  footer,
  showBack = false,
  onBack,
}: FormModalProps): React.JSX.Element | null {
  const containerRef = useRef<HTMLDivElement>(null);
  const titleId = `form-modal-title-${title.replace(/\s/g, '-').toLowerCase()}`;

  useFocusTrap(containerRef, isOpen);
  useScrollLock(isOpen);

  const handleEscape = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape' && isOpen) onClose();
  }, [isOpen, onClose]);

  useEffect(() => {
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [handleEscape]);

  if (!isOpen) return null;

  return (
    <>
      <Overlay onClick={onClose} />
      <div className="fixed inset-0 z-60 flex items-end md:items-center justify-center sm:p-4 pointer-events-none">
        <div
          ref={containerRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className={[
            'bg-surface-card shadow-3 w-full pointer-events-auto',
            'flex flex-col',
            // Mobile (bottom sheet)
            'rounded-t-2xl max-h-[85vh] animate-slide-up pb-[env(safe-area-inset-bottom)]',
            // Desktop (centered modal)
            'md:rounded-xl md:max-h-[calc(100vh-32px)] md:animate-modal-in md:pb-0',
            MODAL_SIZE_MAP[size],
          ].join(' ')}
        >
          {/* Mobile Handle Bar */}
          <div className="md:hidden flex justify-center pt-3 pb-1 shrink-0" aria-hidden="true">
            <div className="w-12 h-1.5 bg-neutral-300 rounded-full" />
          </div>

          {/* Header — sticky */}
          <div className="flex items-center gap-3 px-6 pb-4 md:py-4 border-b border-border-default shrink-0">
            {showBack && (
              <button
                onClick={onBack}
                aria-label="Pichhe jaiye"
                className="p-1.5 text-text-muted hover:text-text-primary rounded-md hover:bg-surface-hover transition-colors"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
                </svg>
              </button>
            )}
            <h2 id={titleId} className="flex-1 text-lg font-semibold text-text-primary leading-tight">
              {title}
            </h2>
            <button
              onClick={onClose}
              aria-label="Modal band karein"
              className="p-1.5 text-text-muted hover:text-text-primary rounded-md hover:bg-surface-hover transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* Body — scrollable */}
          <div className="flex-1 overflow-y-auto p-6 min-h-0">
            {children}
          </div>

          {/* Footer — sticky */}
          {footer && (
            <div className="px-6 py-4 border-t border-border-default shrink-0 flex justify-end gap-3">
              {footer}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
