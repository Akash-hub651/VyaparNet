'use client';

/**
 * Button — components/ui/Button.tsx
 *
 * Authority: seller_dashboard_screen_system.md §G.8 (Button Variant System)
 *
 * Rules from spec:
 * - 5 variants: primary, secondary, ghost, destructive, ghost-destructive
 * - 3 sizes: sm (h-8), md (h-10 default), lg (h-12)
 * - Loading state: spinner replaces icon, width unchanged
 * - Disabled: aria-disabled (not HTML disabled) — allows focus + tooltip
 * - Focus ring: brand-500 2px outline, 2px offset (all variants)
 * - Press micro-interaction: scale(0.98) on active
 * - Minimum touch target: 44×44px (mobile — enforced via min-h)
 */

import React from 'react';

/* ── SPINNER COMPONENT ───────────────────────────────────────── */
function Spinner({ size, color }: { size: number; color: string }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className="animate-spin-fast flex-shrink-0"
      style={{ color }}
    >
      <circle
        cx="12" cy="12" r="10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray="60 40"
        opacity="0.3"
      />
      <path
        d="M12 2a10 10 0 0 1 10 10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

/* ── VARIANT STYLE MAP ───────────────────────────────────────── */
const VARIANT_CLASSES = {
  primary: [
    'bg-brand-600 text-white border-transparent',
    'hover:bg-brand-500',
    'active:bg-brand-700',
    'disabled:bg-neutral-200 disabled:text-neutral-700 disabled:cursor-not-allowed disabled:opacity-60',
  ].join(' '),

  secondary: [
    'bg-transparent text-brand-600 border-[1.5px] border-brand-600',
    'hover:bg-brand-50',
    'active:bg-brand-100',
    'disabled:border-neutral-200 disabled:text-neutral-400 disabled:cursor-not-allowed',
  ].join(' '),

  ghost: [
    'bg-transparent text-text-secondary border-transparent',
    'hover:bg-surface-hover',
    'active:bg-neutral-200',
    'disabled:text-text-muted disabled:cursor-not-allowed',
  ].join(' '),

  destructive: [
    'bg-error-600 text-white border-transparent',
    'hover:bg-error-500',
    'active:bg-error-700',
    'disabled:bg-neutral-200 disabled:text-neutral-700 disabled:cursor-not-allowed',
  ].join(' '),

  'ghost-destructive': [
    'bg-transparent text-error-600 border-transparent',
    'hover:bg-error-50',
    'active:bg-error-100',
    'disabled:text-neutral-400 disabled:cursor-not-allowed',
  ].join(' '),
} as const;

/* ── SIZE CLASS MAP ──────────────────────────────────────────── */
const SIZE_CLASSES = {
  sm: { wrapper: 'h-8 px-3 gap-1.5 text-xs min-h-[44px] sm:min-h-[32px]', icon: 14, spinner: 14 },
  md: { wrapper: 'h-10 px-4 gap-2 text-sm  min-h-[44px] sm:min-h-[40px]', icon: 16, spinner: 16 },
  lg: { wrapper: 'h-12 px-5 gap-2 text-base min-h-[44px]',                icon: 18, spinner: 18 },
} as const;

/* ── SPINNER COLOR ───────────────────────────────────────────── */
function getSpinnerColor(variant: keyof typeof VARIANT_CLASSES): string {
  if (variant === 'primary' || variant === 'destructive') return '#FFFFFF';
  if (variant === 'secondary') return 'var(--color-brand-600)';
  if (variant === 'ghost-destructive') return 'var(--color-error-600)';
  return 'var(--color-text-secondary)';
}

/* ── COMPONENT TYPES ─────────────────────────────────────────── */
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual style. Default: 'primary' */
  variant?: keyof typeof VARIANT_CLASSES;
  /** Size. Default: 'md' */
  size?: keyof typeof SIZE_CLASSES;
  /** Shows spinner and disables interaction. Button width stays unchanged. */
  isLoading?: boolean;
  /** Icon to display (left side by default) */
  icon?: React.ReactNode;
  /** Place icon on right side instead of left */
  iconRight?: boolean;
  /** Icon-only button. Set aria-label required. */
  iconOnly?: boolean;
  /** Full width button */
  fullWidth?: boolean;
  /** Disabled reason — shown in tooltip. Uses aria-disabled (not HTML disabled) */
  disabledReason?: string;
  children?: React.ReactNode;
}

/* ── COMPONENT ───────────────────────────────────────────────── */
export function Button({
  variant = 'primary',
  size = 'md',
  isLoading = false,
  icon,
  iconRight = false,
  iconOnly = false,
  fullWidth = false,
  disabledReason,
  disabled,
  children,
  className = '',
  onClick,
  type = 'button',
  ...rest
}: ButtonProps): React.JSX.Element {
  const isDisabled = disabled || isLoading;
  const sizes = SIZE_CLASSES[size];

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (isDisabled) { e.preventDefault(); return; }
    onClick?.(e);
  };

  return (
    <button
      type={type}
      onClick={handleClick}
      aria-disabled={isDisabled ? 'true' : undefined}
      aria-busy={isLoading ? 'true' : undefined}
      disabled={variant === 'destructive' ? isDisabled : false}
      title={isDisabled && disabledReason ? disabledReason : undefined}
      className={[
        /* Base — always applied */
        'inline-flex items-center justify-center',
        'font-semibold rounded-md border',
        'transition-all duration-100 ease-in-out',
        'focus-visible:outline-none focus-visible:ring-2',
        'focus-visible:ring-brand-500 focus-visible:ring-offset-2',
        'select-none cursor-pointer',
        'active:scale-[0.98]',
        /* Variant */
        VARIANT_CLASSES[variant],
        /* Size */
        iconOnly ? `w-10 h-10 p-0 ${size === 'sm' ? 'w-8 h-8' : ''} ${size === 'lg' ? 'w-12 h-12' : ''}` : sizes.wrapper,
        /* Loading opacity */
        isLoading && !isDisabled ? 'opacity-80' : '',
        /* Full width */
        fullWidth ? 'w-full' : '',
        className,
      ].filter(Boolean).join(' ')}
      {...rest}
    >
      {/* Left icon / spinner */}
      {!iconRight && (isLoading ? (
        <Spinner size={sizes.spinner} color={getSpinnerColor(variant)} />
      ) : icon ? (
        <span aria-hidden="true" className="flex-shrink-0">{icon}</span>
      ) : null)}

      {/* Label */}
      {!iconOnly && children && (
        <span>{children}</span>
      )}

      {/* Right icon */}
      {iconRight && !isLoading && icon && (
        <span aria-hidden="true" className="flex-shrink-0">{icon}</span>
      )}
    </button>
  );
}
