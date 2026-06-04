'use client';

/**
 * EmptyState — components/ui/EmptyState.tsx
 *
 * Authority: seller_dashboard_screen_system.md §22 (Empty Screens Global Register)
 * INVARIANT-UX-6: Empty states must always include a clear next action
 *                 (when one logically exists)
 *
 * Rules:
 * - Structure: [Emoji/Icon] → [Title text-base semibold] → [Body text-sm secondary] → [CTA?]
 * - Icon color: neutral-400 (always muted — never error/warning for empty)
 * - Background: same as table (no box/card around empty state within table)
 * - For full-page empty states: centered within content area
 */

import React from 'react';
import { Button } from './Button';

/* ── EMPTY STATE REGISTRY ────────────────────────────────────── */
/* Authority: screen_system §22 — registered empty states        */
export const EMPTY_STATES = {
  orders:         { emoji: '📋', title: 'Koi order nahi mila',          body: 'Abhi koi order nahi hai. Jab buyers order karenge, woh yahan dikhenge.' },
  orders_filtered:{ emoji: '🔍', title: 'Koi order nahi mila',          body: 'Is filter ke liye koi order nahi. Doosra filter try karein.' },
  products:       { emoji: '📦', title: 'Koi product nahi',             body: 'Pehla product add karein aur selling shuru karein.' },
  inventory:      { emoji: '🗄️',  title: 'Inventory khaali hai',          body: 'Koi product inventory mein nahi. Pehle catalog mein product add karein.' },
  rfq:            { emoji: '📝', title: 'Koi RFQ nahi mila',            body: 'Aapke segment mein koi open RFQ nahi — check back soon.' },
  rfq_filtered:   { emoji: '🔍', title: 'Koi RFQ nahi mila',            body: 'Is filter ke liye koi RFQ nahi. Doosra tab try karein.' },
  notifications:  { emoji: '🔔', title: 'Koi notification nahi',        body: 'Aap sabse update hain! Nayi activity aane par yahan dikhegi.' },
  returns:        { emoji: '↩️',  title: 'Koi return request nahi',      body: 'Koi return nahi — yeh ek achhi baat hai! Return aane par yahan dikhenge.' },
  disputes:       { emoji: '🛡️', title: 'Koi dispute nahi',             body: 'Koi active dispute nahi. Dispute aane par yahan dikhega.' },
  payouts:        { emoji: '💳', title: 'Koi payout nahi abhi tak',     body: 'Pehla order complete hone ke baad payout yahan dikhega.' },
  analytics:      { emoji: '📊', title: 'Data abhi available nahi',     body: 'Analytics Sprint 9 mein aayega. Abhi ke liye orders aur inventory dekhein.' },
  search:         { emoji: '🔍', title: 'Koi result nahi mila',         body: 'Is search ke liye kuch nahi mila. Doosra term try karein.' },
  help:           { emoji: '💬', title: 'Koi ticket nahi',              body: 'Koi support ticket submit nahi kiya. Naya ticket yahan create karen.' },
} as const;

export type EmptyStateKey = keyof typeof EMPTY_STATES;

/* ── COMPONENT ───────────────────────────────────────────────── */
export interface EmptyStateProps {
  /** Pre-defined empty state key from registry — OR use custom props */
  preset?: EmptyStateKey;
  /** Custom emoji (use if not using preset) */
  emoji?: string;
  /** Custom title (use if not using preset) */
  title?: string;
  /** Custom body text (use if not using preset) */
  body?: string;
  /** CTA button label */
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
  emoji,
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
  const displayEmoji = emoji ?? data?.emoji ?? '📋';
  const displayTitle = title ?? data?.title ?? 'Koi data nahi';
  const displayBody  = body  ?? data?.body  ?? '';

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
      {/* Emoji/Icon */}
      <span
        aria-hidden="true"
        className="text-4xl mb-4 select-none"
        role="img"
      >
        {displayEmoji}
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
      {(ctaLabel || secondaryLabel) && (
        <div className="flex flex-col sm:flex-row gap-3">
          {ctaLabel && onCta && (
            <Button variant="primary" onClick={onCta}>
              {ctaLabel}
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
