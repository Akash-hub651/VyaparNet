'use client';

/**
 * OtpInput — apps/seller-dashboard/app/(auth)/login/OtpInput.tsx
 *
 * Authority: seller_dashboard_uxui_system.md §34.4 (Step 2 — OTP Verification)
 *            seller_dashboard_uxui_system.md §34.11 (Accessibility — Login)
 *
 * 6-box OTP input with full keyboard navigation, paste support,
 * auto-advance, backspace-on-empty behavior, and SMS autofill.
 *
 * Accessibility:
 * - Wrapped in <fieldset><legend class="sr-only">6-digit OTP</legend>
 * - Each box: aria-label="OTP digit N of 6"
 * - Error state: aria-invalid + role="alert" for error message
 * - Auto-submit notification: aria-live="polite" before redirect
 */

import React, { useRef, useEffect, forwardRef, useImperativeHandle } from 'react';

const OTP_LENGTH = 6;

export interface OtpInputHandle {
  /** Clears all boxes and focuses box 1 */
  clear: () => void;
  /** Focus first empty box (or box 1 if all filled) */
  focus: () => void;
}

export interface OtpInputProps {
  value: string;                        // 0-6 digit string
  onChange: (value: string) => void;
  onComplete?: (value: string) => void; // Called when 6th digit entered
  disabled?: boolean;
  hasError?: boolean;
  className?: string;
}

export const OtpInput = forwardRef<OtpInputHandle, OtpInputProps>(function OtpInput(
  { value, onChange, onComplete, disabled = false, hasError = false, className = '' },
  ref,
) {
  const inputRefs = useRef<(HTMLInputElement | null)[]>(Array(OTP_LENGTH).fill(null));

  // Expose clear and focus to parent via ref
  useImperativeHandle(ref, () => ({
    clear() {
      onChange('');
      inputRefs.current[0]?.focus();
    },
    focus() {
      const firstEmpty = [...Array(OTP_LENGTH)].findIndex((_, i) => !value[i]);
      const idx = firstEmpty === -1 ? 0 : firstEmpty;
      inputRefs.current[idx]?.focus();
    },
  }));

  // Auto-focus box 1 on mount
  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  function getDigit(index: number): string {
    return value[index] ?? '';
  }

  function handleChange(index: number, raw: string) {
    // Allow only digits
    const digit = raw.replace(/\D/g, '').slice(-1);
    if (!digit) return;

    const digits = value.split('');
    digits[index] = digit;
    const newValue = digits.join('').slice(0, OTP_LENGTH);
    onChange(newValue);

    // Auto-advance
    if (index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    } else if (newValue.length === OTP_LENGTH) {
      // 6th digit entered — trigger complete
      onComplete?.(newValue);
    }
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace') {
      e.preventDefault();
      if (getDigit(index)) {
        // Current box is filled → clear it
        const digits = value.split('');
        digits[index] = '';
        onChange(digits.join(''));
      } else if (index > 0) {
        // Current box is empty → move to previous and clear it
        const digits = value.split('');
        digits[index - 1] = '';
        onChange(digits.join(''));
        inputRefs.current[index - 1]?.focus();
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      e.preventDefault();
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < OTP_LENGTH - 1) {
      e.preventDefault();
      inputRefs.current[index + 1]?.focus();
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, OTP_LENGTH);
    if (!pasted) return;
    onChange(pasted);
    // Focus the box after the last pasted digit (or last box)
    const nextFocus = Math.min(pasted.length, OTP_LENGTH - 1);
    inputRefs.current[nextFocus]?.focus();
    // If full OTP pasted
    if (pasted.length === OTP_LENGTH) {
      onComplete?.(pasted);
    }
  }

  return (
    <fieldset className={`border-none p-0 m-0 ${className}`}>
      {/* sr-only legend for screen readers — §34.11 */}
      <legend className="sr-only">6-digit OTP</legend>

      <div className="flex items-center gap-2" role="group">
        {Array.from({ length: OTP_LENGTH }, (_, i) => {
          const digit = getDigit(i);
          const isFilled = !!digit;
          const isError = hasError;

          return (
            <input
              key={i}
              ref={(el) => { inputRefs.current[i] = el; }}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              autoComplete={i === 0 ? 'one-time-code' : 'off'}
              aria-label={`OTP digit ${i + 1} of 6`}
              aria-invalid={isError ? 'true' : undefined}
              disabled={disabled}
              onChange={(e) => handleChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              onPaste={i === 0 ? handlePaste : undefined}
              className={[
                // Authority: §34.4 — h-12 w-10 per box
                'h-12 w-10 rounded-md text-center',
                'text-xl font-bold text-text-primary',
                'border transition-all duration-100',
                'focus:outline-none focus:ring-2',
                // Disabled
                disabled ? 'opacity-50 cursor-not-allowed bg-surface-hover' : 'bg-surface-card',
                // Error state
                isError
                  ? 'border-error-500 bg-error-50 focus:border-error-500 focus:ring-error-200'
                  // Filled state
                  : isFilled
                    ? 'border-brand-500 bg-brand-50 focus:border-brand-500 focus:ring-brand-200/50'
                    // Default + focus state
                    : 'border-border-strong focus:border-brand-500 focus:ring-brand-200/50',
              ].filter(Boolean).join(' ')}
            />
          );
        })}
      </div>
    </fieldset>
  );
});
