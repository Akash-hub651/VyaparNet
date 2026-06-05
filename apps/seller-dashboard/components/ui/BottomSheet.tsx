"use client";

/**
 * BottomSheet — apps/seller-dashboard/components/ui/BottomSheet.tsx
 *
 * Authority: seller_dashboard_screen_system.md §G.12 (Mobile Navigation / Aur Bottom Sheet)
 *            seller_dashboard_uxui_system.md §15 (Modal & Drawer System — Mobile Variant)
 *
 * D-06 FIX: Native bottom sheet for mobile "More" menu and other mobile contexts.
 * Replaces FormModal (centered dialog) which was incorrect for this interaction.
 *
 * Spec requirements:
 *  - fixed bottom-0 left-0 right-0 (slides up from bottom)
 *  - rounded-t-2xl
 *  - Handle bar: 36×4px, bg-neutral-300, centered
 *  - Swipe-to-close gesture (touch drag down)
 *  - Backdrop bg-black/40 + backdrop-blur-sm
 *  - Focus trap within sheet
 *  - Escape key closes
 *  - Safe area padding bottom (pb-safe via CSS env)
 *  - z-60 layer (above content, below toasts)
 *  - Accessibility: role="dialog" aria-modal="true" aria-labelledby
 */

import React, { useEffect, useRef, useCallback, useId } from "react";

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export function BottomSheet({
  isOpen,
  onClose,
  title,
  children,
}: BottomSheetProps): React.JSX.Element | null {
  const sheetRef = useRef<HTMLDivElement>(null);
  // MEDIUM-A5 FIX: useId() is stable across renders and SSR-safe.
  // Math.random() causes hydration mismatches and different IDs on each render in StrictMode.
  const generatedId = useId();
  const titleId = `bs-title-${generatedId.replace(/:/g, '')}`;

  // Swipe-to-close state
  const touchStartY = useRef<number | null>(null);
  const touchCurrentY = useRef<number | null>(null);

  // Escape key handler
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose]);

  // Body scroll lock
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  // Focus trap — focus first focusable element when opened + LOW-A8 FIX: Tab cycling
  useEffect(() => {
    if (!isOpen || !sheetRef.current) return;
    const sheet = sheetRef.current;
    const getFocusable = () =>
      Array.from(
        sheet.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );

    // Focus first element
    setTimeout(() => {
      const focusable = getFocusable();
      if (focusable.length > 0) focusable[0].focus();
    }, 50);

    // Tab cycling — keep focus inside sheet
    const handleTab = (e: KeyboardEvent) => {
      const focusable = getFocusable();
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.key === 'Tab') {
        if (e.shiftKey) {
          // Shift+Tab on first element → jump to last
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          // Tab on last element → jump to first
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };
    document.addEventListener('keydown', handleTab);
    return () => document.removeEventListener('keydown', handleTab);
  }, [isOpen]);

  // Swipe-to-close gesture handlers
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
    touchCurrentY.current = e.touches[0].clientY;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (touchStartY.current === null) return;
    touchCurrentY.current = e.touches[0].clientY;

    const delta = touchCurrentY.current - touchStartY.current;
    if (delta > 0 && sheetRef.current) {
      // Drag sheet down proportionally, with resistance
      sheetRef.current.style.transform = `translateY(${Math.min(delta, 200)}px)`;
      sheetRef.current.style.transition = "none";
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (
      touchStartY.current === null ||
      touchCurrentY.current === null
    )
      return;

    const delta = touchCurrentY.current - touchStartY.current;

    if (sheetRef.current) {
      sheetRef.current.style.transform = "";
      sheetRef.current.style.transition = "";
    }

    // Close if dragged down more than 80px or at fast velocity
    if (delta > 80) {
      onClose();
    }

    touchStartY.current = null;
    touchCurrentY.current = null;
  }, [onClose]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm z-60 animate-[fadeIn_150ms_ease]"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="fixed bottom-0 left-0 right-0 z-61 bg-surface-card rounded-t-2xl shadow-3 animate-[slideUp_200ms_ease] max-h-[85vh] flex flex-col"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Handle bar — spec: 36×4px, bg-neutral-300, centered */}
        <div className="flex justify-center pt-3 pb-1 shrink-0" aria-hidden="true">
          <div className="w-9 h-1 bg-neutral-300 rounded-full" />
        </div>

        {/* Title */}
        <div className="px-5 py-3 border-b border-border-default shrink-0">
          <h2
            id={titleId}
            className="text-base font-semibold text-text-primary"
          >
            {title}
          </h2>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto overscroll-contain">
          {children}
        </div>
      </div>

      <style>{`
        @keyframes slideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </>
  );
}
