'use client';

/**
 * EmptyState — components/ui/EmptyState.tsx
 *
 * Authority: seller_dashboard_screen_system.md §22 (Empty Screens Global Register)
 * INVARIANT-UX-6: Empty states must always include a clear next action
 *                 (when one logically exists)
 *
 * Rules:
 * - Structure: [Icon 48px/neutral-400] → [Title text-base semibold] → [Body text-sm secondary] → [CTA?]
 * - Icon color: neutral-400 (always muted — never error/warning for empty)
 * - Background: same as table (no box/card around empty state within table)
 * - For full-page empty states: centered within content area
 */

import React from 'react';
import { Button } from './Button';
import { 
  LayoutDashboard, 
  ShoppingCart, 
  CheckCircle2, 
  Search, 
  Package, 
  Layers, 
  FileText, 
  Bell, 
  BarChart2, 
  RotateCcw, 
  Shield, 
  Wallet, 
  SearchX,
  type LucideIcon
} from 'lucide-react';

/* ── EMPTY STATE REGISTRY ────────────────────────────────────── */
/* Authority: screen_system §22.1 — Complete Empty State Register */

export interface EmptyStateDefinition {
  icon: LucideIcon;
  title: string;
  body: string;
  defaultCtaLabel?: string;
}

export const EMPTY_STATES: Record<string, EmptyStateDefinition> = {
  dashboard_new: {
    icon: LayoutDashboard,
    title: 'VyaparNet pe swagat!',
    body: 'Pehle ek product add karein',
    defaultCtaLabel: '+ Product Add Karein',
  },
  orders_zero: {
    icon: ShoppingCart,
    title: 'Koi order nahi aaya',
    body: 'Jab buyers order karenge, yahan dikhenge',
  },
  orders_pending_clear: {
    icon: CheckCircle2,
    title: 'Sab pending orders clear! 🎉',
    body: 'Abhi koi pending order nahi',
  },
  orders_no_match: {
    icon: Search,
    title: 'Koi order nahi mila',
    body: 'Applied filters se koi order match nahi kiya',
    defaultCtaLabel: 'Filters hatayein',
  },
  products_zero: {
    icon: Package,
    title: 'Abhi koi product nahi',
    body: 'Apna pehla product add karein',
    defaultCtaLabel: '+ Product Add Karein',
  },
  products_rejected_clear: {
    icon: CheckCircle2,
    title: 'Koi rejected product nahi! 🎉',
    body: 'Sab approved ya review mein hain',
  },
  products_draft_clear: {
    icon: Package,
    title: 'Koi draft nahi',
    body: 'Products create karne pe yahan save honge',
    defaultCtaLabel: '+ Product Add Karein',
  },
  products_no_match: {
    icon: Search,
    title: 'Koi product nahi mila', // Title overriden in UI if 'X' is provided
    body: 'Filter ya search change karein',
    defaultCtaLabel: 'Filters hatayein',
  },
  inventory_zero: {
    icon: Layers,
    title: 'Koi inventory nahi',
    body: 'Pehle products add karein',
    defaultCtaLabel: 'Products Jaiye →',
  },
  rfq_all_quoted: {
    icon: CheckCircle2,
    title: 'Sab RFQs pe quote bhej diya! 💪',
    body: 'Naye RFQs aayenge to yahan dikhenge',
  },
  rfq_none_quoted: {
    icon: FileText,
    title: 'Abhi koi quoted RFQ nahi',
    body: 'Jab aap kisi RFQ pe quote bhejenge, woh yahan dikhega.',
  },
  rfq_zero: {
    icon: FileText,
    title: 'Koi RFQ nahi aaya',
    body: 'Aapke segment mein buyers ke RFQs yahan dikhenge',
  },
  notifications_zero: {
    icon: Bell,
    title: 'Koi notification nahi',
    body: 'Orders, products, aur account updates yahan aayenge',
  },
  notifications_all_read: {
    icon: CheckCircle2,
    title: 'Sab padh liye!',
    body: '',
  },
  analytics_no_data: {
    icon: BarChart2,
    title: 'Data abhi nahi hai',
    body: 'Orders aane ke baad analytics dikhne lagega',
  },
  returns_placeholder: {
    icon: RotateCcw,
    title: 'Returns center jald aayega',
    body: 'Buyers ke returns yahan dikhenge',
    defaultCtaLabel: 'Orders Dekho →',
  },
  disputes_placeholder: {
    icon: Shield,
    title: 'Disputes center jald aayega',
    body: 'Active disputes yahan dikhenge',
    defaultCtaLabel: 'Orders Dekho →',
  },
  payouts_placeholder: {
    icon: Wallet,
    title: 'Payout history jald aayega',
    body: 'Completed orders ke payouts yahan dikhenge',
  },
  search_no_results: {
    icon: SearchX,
    title: 'Koi result nahi mila', // Dynamically overridden with query
    body: '',
    defaultCtaLabel: 'Orders mein dhundho →',
  },
};

export type EmptyStateKey = keyof typeof EMPTY_STATES;

/* ── COMPONENT ───────────────────────────────────────────────── */
export interface EmptyStateProps {
  /** Pre-defined empty state key from registry — OR use custom props */
  preset?: EmptyStateKey;
  /** Custom icon component (use if not using preset) */
  icon?: LucideIcon;
  /** Custom title (overrides preset title) */
  title?: string;
  /** Custom body text (overrides preset body) */
  body?: string;
  /** CTA button label (overrides preset defaultCtaLabel) */
  ctaLabel?: string;
  /** CTA click handler */
  onCta?: () => void;
  /** Secondary ghost button (e.g., "Filter hatao") */
  secondaryLabel?: string;
  onSecondary?: () => void;
  /** Whether to render inside a table (no padding changes) or as full-page center */
  inTable?: boolean;
  /** Additional class names */
  className?: string;
}

export function EmptyState({
  preset,
  icon,
  title,
  body,
  ctaLabel,
  onCta,
  secondaryLabel,
  onSecondary,
  inTable = false,
  className = '',
}: EmptyStateProps): React.JSX.Element {
  const data = preset ? EMPTY_STATES[preset] : null;
  const DisplayIcon = icon ?? data?.icon ?? FileText;
  const displayTitle = title ?? data?.title ?? 'Koi data nahi';
  const displayBody  = body ?? data?.body ?? '';
  const displayCtaLabel = ctaLabel ?? data?.defaultCtaLabel;

  return (
    <div
      role="region"
      aria-label={displayTitle}
      className={[
        'flex flex-col items-center justify-center text-center',
        inTable ? 'py-16 px-4' : 'py-20 px-4',
        className,
      ].join(' ')}
    >
      {/* Icon */}
      <span aria-hidden="true" className="text-neutral-400 mb-4 select-none flex items-center justify-center">
        <DisplayIcon width={48} height={48} strokeWidth={1.5} />
      </span>

      {/* Title */}
      <h3 className="text-base font-semibold text-text-primary mb-2">
        {displayTitle}
      </h3>

      {/* Body */}
      {displayBody && (
        <p className="text-sm text-text-secondary max-w-sm leading-relaxed mb-6">
          {displayBody}
        </p>
      )}

      {/* CTA buttons */}
      {(displayCtaLabel || secondaryLabel) && (
        <div className="flex flex-col sm:flex-row gap-3">
          {displayCtaLabel && onCta && (
            <Button variant="primary" onClick={onCta}>
              {displayCtaLabel}
            </Button>
          )}
          {secondaryLabel && onSecondary && (
            <Button variant="ghost" onClick={onSecondary}>
              {secondaryLabel}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
