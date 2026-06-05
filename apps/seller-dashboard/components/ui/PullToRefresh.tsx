"use client";

/**
 * PullToRefresh — apps/seller-dashboard/components/ui/PullToRefresh.tsx
 *
 * Authority: seller_dashboard_screen_system.md §G.12 (Mobile Pull-to-Refresh)
 *
 * LOW-P3 FIX: Event listeners previously re-registered on every state change
 * (deps: [isDragging, isRefreshing, onRefresh, pullProgress]).
 * At 60fps during swipe this caused ~4 listener re-registrations per frame.
 *
 * Fix: Move all mutable state into useRef. Event handlers read from refs,
 * not from closure captures. Only containerRef in deps → single mount/unmount.
 * React state (isDragging, pullProgress, isRefreshing) retained for UI rendering only.
 */

import React, { useState, useEffect, useRef, useCallback } from "react";

export interface PullToRefreshProps {
  onRefresh: () => Promise<void>;
  children: React.ReactNode;
}

export function PullToRefresh({ onRefresh, children }: PullToRefreshProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [pullProgress, setPullProgress] = useState(0); // 0 to 1
  const [isRefreshing, setIsRefreshing] = useState(false);

  const startYRef = useRef<number>(0);
  const currentYRef = useRef<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // LOW-P3 FIX: Mutable refs for gesture state — avoid closure staleness.
  // These are read by event handlers registered once at mount.
  const isDraggingRef = useRef(false);
  const isRefreshingRef = useRef(false);
  const pullProgressRef = useRef(0);

  // Keep onRefresh stable with a ref so the event handler doesn't need it in deps
  const onRefreshRef = useRef(onRefresh);
  useEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);

  const THRESHOLD = 60;

  // Sync ref → state for rendering (after gesture updates ref first)
  const syncIsDragging = useCallback((val: boolean) => {
    isDraggingRef.current = val;
    setIsDragging(val);
  }, []);
  const syncPullProgress = useCallback((val: number) => {
    pullProgressRef.current = val;
    setPullProgress(val);
  }, []);
  const syncIsRefreshing = useCallback((val: boolean) => {
    isRefreshingRef.current = val;
    setIsRefreshing(val);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleTouchStart = (e: TouchEvent) => {
      if (window.scrollY > 0) return;
      if (isRefreshingRef.current) return;

      startYRef.current = e.touches[0].clientY;
      currentYRef.current = startYRef.current;
      syncIsDragging(true);
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isDraggingRef.current) return;
      if (window.scrollY > 0) {
        syncIsDragging(false);
        syncPullProgress(0);
        return;
      }

      currentYRef.current = e.touches[0].clientY;
      const pullDistance = currentYRef.current - startYRef.current;

      if (pullDistance > 0) {
        e.preventDefault();
        const resistance = pullDistance * 0.4;
        const progress = Math.min(resistance / THRESHOLD, 1);
        syncPullProgress(progress);
      }
    };

    const handleTouchEnd = async () => {
      if (!isDraggingRef.current) return;
      syncIsDragging(false);

      if (pullProgressRef.current >= 1 && !isRefreshingRef.current) {
        if (typeof navigator !== "undefined" && navigator.vibrate) {
          navigator.vibrate(10);
        }
        syncIsRefreshing(true);
        try {
          await onRefreshRef.current();
        } finally {
          syncIsRefreshing(false);
          syncPullProgress(0);
        }
      } else {
        syncPullProgress(0);
      }
    };

    // LOW-P3 FIX: Registered ONCE. No deps change → no re-registration on each render.
    container.addEventListener("touchstart", handleTouchStart, {
      passive: false,
    });
    container.addEventListener("touchmove", handleTouchMove, {
      passive: false,
    });
    container.addEventListener("touchend", handleTouchEnd);

    return () => {
      container.removeEventListener("touchstart", handleTouchStart);
      container.removeEventListener("touchmove", handleTouchMove);
      container.removeEventListener("touchend", handleTouchEnd);
    };
  }, []); // Empty deps — handlers read from refs, not closures

  const translateY = isRefreshing
    ? THRESHOLD
    : isDragging
      ? pullProgress * THRESHOLD
      : 0;

  return (
    <div ref={containerRef} className="relative w-full h-full">
      {/* Pull indicator */}
      <div
        className="absolute top-0 left-0 right-0 flex justify-center items-end overflow-hidden z-0 transition-opacity duration-200"
        style={{
          height: THRESHOLD,
          opacity: isDragging || isRefreshing ? 1 : 0,
        }}
        aria-hidden="true"
      >
        <div
          className="bg-white rounded-full shadow-2 w-10 h-10 flex items-center justify-center transform transition-transform"
          style={{
            transform: `translateY(${Math.min(pullProgress * THRESHOLD - 20, 20)}px)`,
          }}
        >
          {isRefreshing ? (
            <svg
              className="animate-spin text-brand-600"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
          ) : (
            <svg
              className="text-brand-600"
              style={{ transform: `rotate(${pullProgress * 360}deg)` }}
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 4v16m0-16-4 4m4-4 4 4" />
            </svg>
          )}
        </div>
      </div>

      {/* Content wrapper */}
      <div
        className="relative z-10 w-full min-h-full"
        style={{
          transform: `translateY(${translateY}px)`,
          transition: isDragging
            ? "none"
            : "transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)",
        }}
      >
        {children}
      </div>
    </div>
  );
}
