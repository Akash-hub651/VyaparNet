'use client';

/**
 * StatusBadge — components/ui/StatusBadge.tsx
 *
 * Authority: seller_dashboard_screen_system.md §G.7
 * The most-used component across all 27 screens.
 * Every instance follows this exact anatomy — no exceptions.
 *
 * NEVER use hex values here — only design token class names.
 */

import React from 'react';

/* ── STATUS COLOR MAP ─────────────────────────────────────────
   Authority: seller_dashboard_screen_system.md §G.7
   seller_dashboard_uxui_system.md §3.3
   ────────────────────────────────────────────────────────────── */
interface StatusColors {
  bg: string;
  text: string;
  dot: string;
}

const STATUS_COLOR_MAP: Record<string, StatusColors> = {
  /* Orders */
  PLACED:           { bg: 'bg-info-100',    text: 'text-info-700',    dot: 'bg-info-500'    },
  CONFIRMED:        { bg: 'bg-brand-100',   text: 'text-brand-600',   dot: 'bg-brand-500'   },
  PROCESSING:       { bg: 'bg-warning-100', text: 'text-warning-700', dot: 'bg-warning-500' },
  SHIPPED:          { bg: 'bg-accent-100',  text: 'text-accent-600',  dot: 'bg-accent-600'  },
  DELIVERED:        { bg: 'bg-success-50',  text: 'text-success-700', dot: 'bg-success-500' },
  COMPLETED:        { bg: 'bg-success-100', text: 'text-success-700', dot: 'bg-success-500' },
  CANCELLED:        { bg: 'bg-neutral-100', text: 'text-neutral-700', dot: 'bg-neutral-200' },
  PAYMENT_FAILED:   { bg: 'bg-error-100',   text: 'text-error-700',   dot: 'bg-error-500'   },
  RETURN_INITIATED: { bg: 'bg-warning-100', text: 'text-warning-700', dot: 'bg-warning-500' },
  REFUND_INITIATED: { bg: 'bg-warning-100', text: 'text-warning-700', dot: 'bg-warning-500' },
  DISPUTE_OPEN:     { bg: 'bg-error-100',   text: 'text-error-700',   dot: 'bg-error-500'   },
  DISPUTE_RESOLVED: { bg: 'bg-neutral-100', text: 'text-neutral-700', dot: 'bg-neutral-200' },
  /* Products */
  ACTIVE:           { bg: 'bg-success-100', text: 'text-success-700', dot: 'bg-success-500' },
  PENDING_REVIEW:   { bg: 'bg-warning-100', text: 'text-warning-700', dot: 'bg-warning-500' },
  DRAFT:            { bg: 'bg-neutral-100', text: 'text-neutral-700', dot: 'bg-neutral-200' },
  REJECTED:         { bg: 'bg-error-100',   text: 'text-error-700',   dot: 'bg-error-500'   },
  ARCHIVED:         { bg: 'bg-neutral-100', text: 'text-neutral-700', dot: 'bg-neutral-200' },
  INACTIVE:         { bg: 'bg-neutral-100', text: 'text-neutral-700', dot: 'bg-neutral-200' },
  /* RFQ */
  NOT_QUOTED:       { bg: 'bg-warning-100', text: 'text-warning-700', dot: 'bg-warning-500' },
  QUOTED:           { bg: 'bg-info-100',    text: 'text-info-700',    dot: 'bg-info-500'    },
  NEGOTIATING:      { bg: 'bg-brand-100',   text: 'text-brand-600',   dot: 'bg-brand-500'   },
  EXPIRED:          { bg: 'bg-neutral-100', text: 'text-neutral-700', dot: 'bg-neutral-200' },
  WON:              { bg: 'bg-success-100', text: 'text-success-700', dot: 'bg-success-500' },
  LOST:             { bg: 'bg-neutral-100', text: 'text-neutral-700', dot: 'bg-neutral-200' },
  ACCEPTED_BY_BUYER:{ bg: 'bg-success-100', text: 'text-success-700', dot: 'bg-success-500' },
  /* Payouts */
  PAYOUT_PENDING:   { bg: 'bg-warning-100', text: 'text-warning-700', dot: 'bg-warning-500' },
  PENDING:          { bg: 'bg-warning-100', text: 'text-warning-700', dot: 'bg-warning-500' },
  PAYOUT_INITIATED: { bg: 'bg-brand-100',   text: 'text-brand-600',   dot: 'bg-brand-500'   },
  INITIATED:        { bg: 'bg-brand-100',   text: 'text-brand-600',   dot: 'bg-brand-500'   },
  PAYOUT_ON_HOLD:   { bg: 'bg-error-100',   text: 'text-error-700',   dot: 'bg-error-500'   },
  ON_HOLD:          { bg: 'bg-error-100',   text: 'text-error-700',   dot: 'bg-error-500'   },
  PAYOUT_REVERSED:  { bg: 'bg-warning-100', text: 'text-warning-700', dot: 'bg-warning-500' },
  REVERSED:         { bg: 'bg-warning-100', text: 'text-warning-700', dot: 'bg-warning-500' },
  /* KYC */
  KYC_VERIFIED:     { bg: 'bg-success-100', text: 'text-success-700', dot: 'bg-success-500' },
  VERIFIED:         { bg: 'bg-success-100', text: 'text-success-700', dot: 'bg-success-500' },
  KYC_PENDING:      { bg: 'bg-warning-100', text: 'text-warning-700', dot: 'bg-warning-500' },
  KYC_REJECTED:     { bg: 'bg-error-100',   text: 'text-error-700',   dot: 'bg-error-500'   },
  /* Returns */
  RETURN_PENDING:         { bg: 'bg-warning-100', text: 'text-warning-700', dot: 'bg-warning-500' },
  APPROVED_FOR_PICKUP:    { bg: 'bg-info-100',    text: 'text-info-700',    dot: 'bg-info-500'    },
  PICKED_UP:              { bg: 'bg-brand-100',   text: 'text-brand-600',   dot: 'bg-brand-500'   },
  RECEIVED_AT_QC:         { bg: 'bg-brand-100',   text: 'text-brand-600',   dot: 'bg-brand-500'   },
  QC_APPROVED:            { bg: 'bg-success-100', text: 'text-success-700', dot: 'bg-success-500' },
  QC_REJECTED:            { bg: 'bg-error-100',   text: 'text-error-700',   dot: 'bg-error-500'   },
  REFUNDED:               { bg: 'bg-success-100', text: 'text-success-700', dot: 'bg-success-500' },
  REPLACEMENT_SENT:       { bg: 'bg-brand-100',   text: 'text-brand-600',   dot: 'bg-brand-500'   },
  CLOSED:                 { bg: 'bg-neutral-100', text: 'text-neutral-700', dot: 'bg-neutral-200' },
  /* Disputes */
  OPEN:             { bg: 'bg-warning-100', text: 'text-warning-700', dot: 'bg-warning-500' },
  UNDER_REVIEW:     { bg: 'bg-info-100',    text: 'text-info-700',    dot: 'bg-info-500'    },
  ESCALATED:        { bg: 'bg-error-100',   text: 'text-error-700',   dot: 'bg-error-500'   },
  RESOLVED_BUYER:   { bg: 'bg-error-100',   text: 'text-error-700',   dot: 'bg-error-500'   },
  RESOLVED_SELLER:  { bg: 'bg-success-100', text: 'text-success-700', dot: 'bg-success-500' },
};

/* ── LABEL MAP (display text for each status key) ─────────────
   Authority: seller_dashboard_screen_system.md §G.7 LABEL TEXT
   ────────────────────────────────────────────────────────────── */
const STATUS_LABEL_MAP: Record<string, string> = {
  /* Orders */
  PLACED: 'Placed', CONFIRMED: 'Confirmed', PROCESSING: 'Processing',
  SHIPPED: 'Shipped', DELIVERED: 'Delivered', COMPLETED: 'Delivered',
  CANCELLED: 'Cancelled', PAYMENT_FAILED: 'Payment Failed',
  RETURN_INITIATED: 'Return Initiated', REFUND_INITIATED: 'Refund Initiated',
  DISPUTE_OPEN: 'Dispute', DISPUTE_RESOLVED: 'Resolved',
  /* Products */
  ACTIVE: 'Active', PENDING_REVIEW: 'Under Review', DRAFT: 'Draft',
  REJECTED: 'Rejected', ARCHIVED: 'Archived', INACTIVE: 'Inactive',
  /* RFQ */
  NOT_QUOTED: 'Quote Karo', QUOTED: 'Quoted', NEGOTIATING: 'Negotiating',
  EXPIRED: 'Expired', WON: 'Won', LOST: 'Lost', ACCEPTED_BY_BUYER: 'Accepted',
  /* Payouts */
  PAYOUT_PENDING: 'Pending', PENDING: 'Pending',
  PAYOUT_INITIATED: 'Initiated', INITIATED: 'Initiated',
  PAYOUT_ON_HOLD: 'On Hold', ON_HOLD: 'On Hold',
  PAYOUT_REVERSED: 'Reversed', REVERSED: 'Reversed',
  /* KYC */
  KYC_VERIFIED: 'Verified', VERIFIED: 'Verified',
  KYC_PENDING: 'Pending', KYC_REJECTED: 'Rejected',
  /* Returns */
  RETURN_PENDING: 'Pending', APPROVED_FOR_PICKUP: 'Pickup Approved',
  PICKED_UP: 'Picked Up', RECEIVED_AT_QC: 'At QC', QC_APPROVED: 'QC Passed',
  QC_REJECTED: 'QC Failed', REFUNDED: 'Refunded',
  REPLACEMENT_SENT: 'Replacement Sent', CLOSED: 'Closed',
  /* Disputes */
  OPEN: 'Open', UNDER_REVIEW: 'Under Review', ESCALATED: 'Escalated',
  RESOLVED_BUYER: 'Buyer Won', RESOLVED_SELLER: 'You Won',
};

/* ── FALLBACK for unknown status keys ─────────────────────────
   Authority: screen_system §G.7 "UNKNOWN STATUS FALLBACK"
   ────────────────────────────────────────────────────────────── */
const UNKNOWN_COLORS: StatusColors = {
  bg: 'bg-neutral-100', text: 'text-neutral-700', dot: 'bg-neutral-200',
};

/* ── SIZE VARIANTS ────────────────────────────────────────────
   Authority: screen_system §G.7 ANATOMY + LARGE VARIANT
   ────────────────────────────────────────────────────────────── */
const SIZE_CLASSES = {
  sm: {
    wrapper: 'h-5 px-2 gap-1 text-xs',
    dot:     'w-1.5 h-1.5',
  },
  md: {
    wrapper: 'h-6 px-2.5 gap-1.5 text-xs',
    dot:     'w-1.5 h-1.5',
  },
  lg: {
    wrapper: 'h-8 px-3 gap-1.5 text-sm',
    dot:     'w-2 h-2',
  },
} as const;

/* ── COMPONENT ────────────────────────────────────────────────── */
export interface StatusBadgeProps {
  /** Status key from STATUS_COLOR_MAP — e.g. "PLACED", "ACTIVE" */
  status: string;
  /** Size variant. Default: 'md' */
  size?: 'sm' | 'md' | 'lg';
  /** Accessible context — e.g. "Order status" — prepended to aria-label */
  context?: string;
  /** Override display label (bypasses STATUS_LABEL_MAP) */
  label?: string;
  /** Additional class names */
  className?: string;
}

export function StatusBadge({
  status,
  size = 'md',
  context,
  label,
  className = '',
}: StatusBadgeProps): React.JSX.Element {
  const colors = STATUS_COLOR_MAP[status] ?? UNKNOWN_COLORS;
  const displayLabel = label ?? STATUS_LABEL_MAP[status] ?? 'Unknown';
  const sizes = SIZE_CLASSES[size];
  const ariaLabel = context ? `${context}: ${displayLabel}` : displayLabel;

  return (
    <span
      role="status"
      aria-label={ariaLabel}
      className={[
        'inline-flex items-center rounded-full font-medium',
        'select-none whitespace-nowrap flex-shrink-0',
        sizes.wrapper,
        colors.bg,
        colors.text,
        className,
      ].join(' ')}
    >
      {/* Dot indicator */}
      <span
        aria-hidden="true"
        className={[
          'rounded-full flex-shrink-0',
          sizes.dot,
          colors.dot,
        ].join(' ')}
      />
      {displayLabel}
    </span>
  );
}
