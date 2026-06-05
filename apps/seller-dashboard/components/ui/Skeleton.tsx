"use client";

/**
 * Skeleton — components/ui/Skeleton.tsx
 *
 * Authority: seller_dashboard_screen_system.md §23 (Loading Screens)
 * Rule: Skeleton-first loading. No full-page spinners. No blank pages.
 * Every list/detail page must show skeleton shimmer while data loads.
 */

import React from "react";

/* ── BASE SKELETON ───────────────────────────────────────────── */
interface SkeletonProps {
  className?: string;
  style?: React.CSSProperties;
}

export function Skeleton({
  className = "",
  style,
}: SkeletonProps): React.JSX.Element {
  return (
    <div aria-hidden="true" className={`skeleton ${className}`} style={style} />
  );
}

/* ── SKELETON TEXT ───────────────────────────────────────────── */
export function SkeletonText({
  lines = 1,
  className = "",
}: {
  lines?: number;
  className?: string;
}): React.JSX.Element {
  return (
    <div className={`space-y-2 ${className}`} aria-hidden="true">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className="h-4 rounded-md"
          style={{ width: i === lines - 1 && lines > 1 ? "75%" : "100%" }}
        />
      ))}
    </div>
  );
}

/* ── SKELETON KPI CARD ───────────────────────────────────────── */
/* Used in: Dashboard Home (§01) — 4 KPI cards                   */
export function SkeletonKpiCard(): React.JSX.Element {
  return (
    <div
      aria-hidden="true"
      className="bg-surface-card rounded-xl p-5 border border-border-default space-y-3"
    >
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-24 rounded" />
        <Skeleton className="h-8 w-8 rounded-lg" />
      </div>
      <Skeleton className="h-8 w-20 rounded" />
      <Skeleton className="h-3 w-28 rounded" />
    </div>
  );
}

/* ── SKELETON TABLE ROW ──────────────────────────────────────── */
/* Used in: Orders List, Products List, Inventory, RFQ List       */
export function SkeletonTableRow({
  cols = 5,
}: {
  cols?: number;
}): React.JSX.Element {
  return (
    <div
      aria-hidden="true"
      className="flex items-center gap-4 px-4 py-3 border-b border-border-default"
      style={{ height: "52px" }}
    >
      {/* Checkbox */}
      <Skeleton className="h-4 w-4 rounded shrink-0" />
      {/* Columns */}
      {Array.from({ length: cols - 1 }).map((_, i) => (
        <Skeleton
          key={i}
          className="h-4 rounded"
          style={{ flex: i === 0 ? 2 : 1 }}
        />
      ))}
    </div>
  );
}

/* ── SKELETON TABLE ──────────────────────────────────────────── */
export function SkeletonTable({
  rows = 8,
  cols = 5,
}: {
  rows?: number;
  cols?: number;
}): React.JSX.Element {
  return (
    <div aria-label="Loading..." aria-busy="true" role="status">
      {/* Table header skeleton */}
      <div className="flex items-center gap-4 px-4 py-2.5 bg-surface-app border-b border-border-default">
        <Skeleton className="h-3 w-4 rounded" />
        {Array.from({ length: cols - 1 }).map((_, i) => (
          <Skeleton
            key={i}
            className="h-3 rounded"
            style={{ flex: i === 0 ? 2 : 1 }}
          />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonTableRow key={i} cols={cols} />
      ))}
      <span className="sr-only">Loading data, please wait...</span>
    </div>
  );
}

/* ── SKELETON CARD ───────────────────────────────────────────── */
/* Used in: Notifications, RFQ cards, mobile list views          */
export function SkeletonCard({
  className = "",
}: {
  className?: string;
}): React.JSX.Element {
  return (
    <div
      aria-hidden="true"
      className={`bg-surface-card rounded-xl p-4 border border-border-default space-y-3 ${className}`}
    >
      <div className="flex items-center gap-3">
        <Skeleton className="h-8 w-8 rounded-lg shrink-0" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-3/4 rounded" />
          <Skeleton className="h-3 w-1/2 rounded" />
        </div>
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>
      <SkeletonText lines={2} />
    </div>
  );
}

/* ── SKELETON DETAIL PAGE ────────────────────────────────────── */
/* Used in: Order Detail, RFQ Detail pages                       */
export function SkeletonDetailPage(): React.JSX.Element {
  return (
    <div
      aria-label="Loading..."
      aria-busy="true"
      role="status"
      className="space-y-6"
    >
      {/* Page header */}
      <div className="flex items-center gap-4">
        <Skeleton className="h-8 w-48 rounded" />
        <Skeleton className="h-6 w-20 rounded-full" />
      </div>
      {/* Two column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-surface-card rounded-xl p-5 border border-border-default space-y-4">
            <Skeleton className="h-5 w-32 rounded" />
            <SkeletonTableRow cols={3} />
            <SkeletonTableRow cols={3} />
          </div>
        </div>
        <div className="space-y-4">
          <div className="bg-surface-card rounded-xl p-5 border border-border-default space-y-3">
            <Skeleton className="h-5 w-24 rounded" />
            <SkeletonText lines={4} />
          </div>
        </div>
      </div>
      <span className="sr-only">Loading data, please wait...</span>
    </div>
  );
}

/* ── FULL PAGE LOADER ────────────────────────────────────────── */
/* Used in: Auth check, initial app hydration                    */
/* Authority: (main)/layout.tsx auth guard display               */
export function FullPageLoader(): React.JSX.Element {
  return (
    <div
      role="status"
      aria-label="Loading..."
      className="fixed inset-0 flex items-center justify-center bg-surface-app z-50"
    >
      <div className="flex flex-col items-center gap-4">
        {/* VN monogram */}
        <div className="w-12 h-12 rounded-xl bg-brand-600 flex items-center justify-center">
          <span className="text-white text-lg font-bold tracking-tight">
            VN
          </span>
        </div>
        {/* Shimmer bar */}
        <div className="w-40 h-1.5 rounded-full overflow-hidden bg-neutral-200">
          <div
            className="h-full skeleton rounded-full"
            style={{ width: "60%" }}
          />
        </div>
        <span className="text-sm text-text-secondary">Loading...</span>
      </div>
    </div>
  );
}

/* ── ADDITIONAL CATALOG SKELETONS (SCREEN 23) ────────────────── */

export function SkeletonRowMobile(): React.JSX.Element {
  return (
    <div
      aria-hidden="true"
      className="flex flex-col gap-2 p-4 border-b border-border-default"
      style={{ height: "72px" }}
    >
      <div className="flex justify-between items-center w-full">
        <Skeleton className="h-4 w-1/2 rounded" />
        <Skeleton className="h-4 w-16 rounded" />
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-3 w-20 rounded" />
        <Skeleton className="h-3 w-16 rounded" />
      </div>
    </div>
  );
}

export function SkeletonTextBlock({
  className = "",
}: {
  className?: string;
}): React.JSX.Element {
  return (
    <div className={`space-y-2 w-full ${className}`} aria-hidden="true">
      <Skeleton className="h-4 w-full rounded" />
      <Skeleton className="h-4 w-[90%] rounded" />
      <Skeleton className="h-4 w-[60%] rounded" />
    </div>
  );
}

export function SkeletonAvatar({
  className = "",
}: {
  className?: string;
}): React.JSX.Element {
  return <Skeleton className={`w-10 h-10 rounded-full ${className}`} />;
}

export function SkeletonBadge({
  className = "",
}: {
  className?: string;
}): React.JSX.Element {
  return <Skeleton className={`w-20 h-6 rounded-full ${className}`} />;
}

export function SkeletonScorecard({
  className = "",
}: {
  className?: string;
}): React.JSX.Element {
  return (
    <div
      className={`w-full h-[280px] bg-surface-card rounded-xl border border-border-default p-6 flex flex-col items-center justify-center gap-4 ${className}`}
      aria-hidden="true"
    >
      <Skeleton className="w-32 h-32 rounded-full" />
      <Skeleton className="w-24 h-6 rounded" />
      <Skeleton className="w-48 h-4 rounded" />
    </div>
  );
}

export function SkeletonChart({
  className = "",
}: {
  className?: string;
}): React.JSX.Element {
  return (
    <div
      className={`w-full h-[240px] bg-surface-card rounded-xl border border-border-default p-6 flex flex-col justify-end gap-2 ${className}`}
      aria-hidden="true"
    >
      <div className="flex items-end justify-between h-full w-full gap-2 pb-4">
        {/* Simulating bar charts */}
        <Skeleton className="w-full h-[40%] rounded-t" />
        <Skeleton className="w-full h-[70%] rounded-t" />
        <Skeleton className="w-full h-[50%] rounded-t" />
        <Skeleton className="w-full h-[90%] rounded-t" />
        <Skeleton className="w-full h-[30%] rounded-t" />
        <Skeleton className="w-full h-[80%] rounded-t" />
        <Skeleton className="w-full h-[60%] rounded-t" />
      </div>
      <div className="flex justify-between w-full">
        <Skeleton className="w-8 h-3 rounded" />
        <Skeleton className="w-8 h-3 rounded" />
        <Skeleton className="w-8 h-3 rounded" />
        <Skeleton className="w-8 h-3 rounded" />
        <Skeleton className="w-8 h-3 rounded" />
        <Skeleton className="w-8 h-3 rounded" />
        <Skeleton className="w-8 h-3 rounded" />
      </div>
    </div>
  );
}

export function SkeletonThumbnail({
  className = "",
}: {
  className?: string;
}): React.JSX.Element {
  return <Skeleton className={`w-10 h-10 rounded-md ${className}`} />;
}
