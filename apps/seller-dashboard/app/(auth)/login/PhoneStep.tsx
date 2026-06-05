'use client';

/**
 * PhoneStep — apps/seller-dashboard/app/(auth)/login/PhoneStep.tsx
 *
 * Authority: seller_dashboard_uxui_system.md §34.3 (Step 1 — Mobile Number Entry)
 *
 * Validates Indian mobile number (starts with 6-9, 10 digits).
 * Validation fires on SUBMIT only (not on blur — spec §34.3).
 * Calls POST /auth/otp/send via auth.client.ts.
 *
 * Error states handled: network, rate limit, account suspended, account locked.
 */

import React, { useState, useRef, useEffect } from 'react';
import { Button } from '../../../components/ui/Button';

export interface PhoneStepProps {
  onSuccess: (phoneNumber: string, expiresIn: number) => void;
  onSendOtp: (phoneNumber: string) => Promise<{
    success: boolean;
    expiresIn?: number;
    error?: string;
    code?: string;
    retryAfterSeconds?: number;
  }>;
}

export function PhoneStep({ onSuccess, onSendOtp }: PhoneStepProps): React.JSX.Element {
  const [mobile, setMobile] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lockoutSeconds, setLockoutSeconds] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus on mount — §34.10
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Lockout countdown ticker
  useEffect(() => {
    if (lockoutSeconds <= 0) return;
    const timer = setInterval(() => {
      setLockoutSeconds((prev) => {
        if (prev <= 1) { clearInterval(timer); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [lockoutSeconds]);

  function validateMobile(value: string): string | null {
    if (!value || value.length === 0) return 'Mobile number zaroor chahiye';
    if (value.length < 10) return 'Mobile number 10 digits ka hona chahiye';
    if (!/^[6-9]/.test(value)) return 'Valid Indian mobile number enter karein (6–9 se shuru hona chahiye)';
    return null; // valid
  }

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();

    const validationError = validateMobile(mobile);
    if (validationError) {
      setError(validationError);
      inputRef.current?.focus();
      return;
    }

    setIsLoading(true);
    setError(null);

    const result = await onSendOtp(`+91${mobile}`);

    setIsLoading(false);

    if (!result.success) {
      if (result.code === 'ACCOUNT_LOCKED' || result.code === 'RATE_LIMITED') {
        setLockoutSeconds(result.retryAfterSeconds ?? 600);
      }
      setError(result.error ?? 'Kuch galat hua. Dobara try karein.');
      return;
    }

    onSuccess(`+91${mobile}`, result.expiresIn ?? 300);
  }

  const isLocked = lockoutSeconds > 0;
  const lockMM = Math.floor(lockoutSeconds / 60);
  const lockSS = String(lockoutSeconds % 60).padStart(2, '0');

  return (
    <form onSubmit={(e) => void handleSubmit(e)} noValidate>
      {/* ── LOCKOUT BANNER ───────────────────────────────────── */}
      {isLocked && (
        <div
          role="alert"
          className="mb-4 px-4 py-3 rounded-lg bg-error-50 border border-error-200 text-sm text-error-700"
        >
          <p className="font-semibold">Account temporarily lock ho gaya</p>
          <p className="mt-0.5">
            {lockMM}:{lockSS} baad try karein.
          </p>
        </div>
      )}

      {/* ── PHONE INPUT ──────────────────────────────────────── */}
      {/* Authority: §34.3 — Combined border, country code read-only, +91 India only */}
      <div className="mb-5">
        <div className="flex justify-between mb-1.5">
          <label
            htmlFor="login-mobile"
            className="block text-sm font-semibold text-text-primary"
          >
            Mobile Number
          </label>
          <span className="text-xs text-text-muted">
            {mobile.length}/10
          </span>
        </div>

        {/*
          Phone input group — §34.3 visual spec:
          ┌────────┬─────────────────────────────────┐
          │  +91   │  98765 43210                    │
          └────────┴─────────────────────────────────┘
          Combined border on outer container, not split.
          Focus: combined ring.
        */}
        <div
          className={[
            'flex items-center rounded-md border overflow-hidden',
            'focus-within:ring-2 focus-within:ring-brand-500 focus-within:ring-offset-0',
            'transition-all duration-100',
            error
              ? 'border-error-500 bg-error-50'
              : 'border-border-strong bg-surface-card',
            isLocked ? 'opacity-60 pointer-events-none' : '',
          ].join(' ')}
        >
          {/* Country code — read-only, §34.3 */}
          <div className="flex items-center justify-center w-16 h-11 border-r border-border-default bg-surface-app text-sm text-text-secondary select-none shrink-0">
            +91
          </div>

          {/* Mobile number input */}
          <input
            ref={inputRef}
            id="login-mobile"
            type="text"
            inputMode="numeric"
            maxLength={10}
            value={mobile}
            disabled={isLoading || isLocked}
            autoComplete="tel-national"
            enterKeyHint="done"
            placeholder="Mobile number"
            aria-label="Mobile number (10 digits, without country code)"
            aria-invalid={!!error ? 'true' : undefined}
            aria-describedby={error ? 'phone-error' : undefined}
            onChange={(e) => {
              // Only digits
              const cleaned = e.target.value.replace(/\D/g, '').slice(0, 10);
              setMobile(cleaned);
              if (error) setError(null); // Clear error on type
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleSubmit();
            }}
            className={[
              'flex-1 h-11 px-3 text-sm text-text-primary bg-transparent',
              'focus:outline-none placeholder:text-text-muted',
              // Min 16px to prevent iOS auto-zoom — §34.9
              'text-base sm:text-sm',
            ].join(' ')}
            style={{ fontSize: '16px' }} // iOS zoom prevention — §34.9
          />
        </div>

        {/* Error message — §34.3 validation messages */}
        {error && !isLocked && (
          <p
            id="phone-error"
            role="alert"
            className="mt-1.5 text-xs text-error-700"
          >
            {error}
          </p>
        )}
      </div>

      {/* ── SUBMIT BUTTON ─────────────────────────────────────── */}
      {/* §34.3: "OTP Bhejo", full-width h-11, loading state text */}
      <Button
        type="submit"
        variant="primary"
        fullWidth
        isLoading={isLoading}
        disabled={isLocked}
        disabledReason={isLocked ? `${lockMM}:${lockSS} baad try karein` : undefined}
        className="h-11"
        aria-label={isLoading ? 'OTP bhej rahe hain, please wait' : 'OTP Bhejo'}
      >
        {isLoading ? 'OTP bhej rahe hain...' : 'OTP Bhejo'}
      </Button>
    </form>
  );
}
