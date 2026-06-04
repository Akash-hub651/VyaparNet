'use client';

/**
 * OtpStep — apps/seller-dashboard/app/(auth)/login/OtpStep.tsx
 *
 * Authority: seller_dashboard_uxui_system.md §34.4 (Step 2 — OTP Verification)
 *            seller_dashboard_uxui_system.md §34.5 (Loading States)
 *            seller_dashboard_uxui_system.md §34.7 (Error States)
 *
 * Key behaviors:
 * - 6-box OTP input via <OtpInput>
 * - OTP expiry timer: text-secondary → text-warning-700 (< 60s) → text-error-700 (< 10s)
 * - Auto-submit when 6th digit entered (§34.4)
 * - Resend OTP: disabled during timer, enabled when expired
 * - Error: shake animation + error-50 bg + clear all boxes
 * - Success: green flash on all boxes → redirect
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { OtpInput, type OtpInputHandle } from './OtpInput';
import { Button } from '../../../components/ui/Button';

export interface OtpStepProps {
  phoneNumber: string;       // Full number with +91 (masked for display)
  expiresIn: number;         // OTP TTL in seconds from server
  onSuccess: () => void;
  onBack: () => void;
  onVerifyOtp: (otp: string) => Promise<{
    success: boolean;
    error?: string;
    code?: string;
    retryAfterSeconds?: number;
    attemptsRemaining?: number;
  }>;
  onResendOtp: () => Promise<{
    success: boolean;
    expiresIn?: number;
    error?: string;
    code?: string;
  }>;
}

export function OtpStep({
  phoneNumber,
  expiresIn,
  onSuccess,
  onBack,
  onVerifyOtp,
  onResendOtp,
}: OtpStepProps): React.JSX.Element {
  const [otp, setOtp] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successFlash, setSuccessFlash] = useState(false);
  const [resendMessage, setResendMessage] = useState<string | null>(null);

  // OTP expiry countdown
  // Initialize secondsLeft directly from prop — avoids setState-in-effect lint error
  const [secondsLeft, setSecondsLeft] = useState(expiresIn);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const otpRef = useRef<OtpInputHandle>(null);

  // Aria live ref for auto-submit announcement — §34.11
  const ariaLiveRef = useRef<HTMLSpanElement>(null);

  /* ── OTP EXPIRY TIMER ─────────────────────────────────────── */
  // startTimer: clear old interval, set new countdown
  const startTimer = useCallback((_seconds: number) => {
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    timerIntervalRef.current = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  // Start timer on mount — use ref for interval, separate from secondsLeft state init
  useEffect(() => {
    startTimer(expiresIn);
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  // startTimer is stable (useCallback with no deps), expiresIn is a mount-time prop
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isExpired = secondsLeft === 0;
  const canResend = isExpired && !isVerifying;

  const timerMM = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
  const timerSS = String(secondsLeft % 60).padStart(2, '0');

  // Timer color logic — §34.4
  function getTimerClass(): string {
    if (secondsLeft < 10) return 'text-error-700 font-semibold';
    if (secondsLeft < 60) return 'text-warning-700';
    return 'text-text-secondary';
  }

  /* ── OTP VERIFY ───────────────────────────────────────────── */
  const handleVerify = useCallback(async (otpValue: string) => {
    if (otpValue.length !== 6 || isVerifying) return;

    // Announce for screen readers before auto-submit — §34.11
    if (ariaLiveRef.current) {
      ariaLiveRef.current.textContent = 'OTP submit ho raha hai...';
    }

    setIsVerifying(true);
    setError(null);

    const result = await onVerifyOtp(otpValue);

    if (!result.success) {
      setIsVerifying(false);

      // Error state: shake + clear boxes — §34.7
      setError(result.error ?? 'OTP galat hai. Dobara check karein.');
      setOtp('');
      // Clear boxes and refocus
      setTimeout(() => {
        otpRef.current?.clear();
      }, 50);

      // If rate limited / locked
      if (result.code === 'RATE_LIMITED' || result.code === 'ACCOUNT_LOCKED') {
        // Error already shown via error state
      }
      return;
    }

    // Success flash — §34.6: brief green flash on all boxes
    setSuccessFlash(true);
    setTimeout(() => {
      onSuccess();
    }, 300);
  }, [isVerifying, onVerifyOtp, onSuccess]);

  /* ── RESEND OTP ───────────────────────────────────────────── */
  async function handleResend() {
    if (!canResend || isResending) return;
    setIsResending(true);
    setError(null);
    setResendMessage(null);

    const result = await onResendOtp();

    setIsResending(false);

    if (!result.success) {
      setError(result.error ?? 'OTP nahi bhej paye. Dobara try karein.');
      return;
    }

    // Reset timer with new expiresIn
    setSecondsLeft(result.expiresIn ?? 300);
    startTimer(result.expiresIn ?? 300);
    setOtp('');
    otpRef.current?.clear();
    setResendMessage('Naya OTP bheja gaya ✓');
    // Clear resend success message after 3s
    setTimeout(() => setResendMessage(null), 3000);
  }

  /* ── MASKED PHONE DISPLAY ─────────────────────────────────── */
  // Show "+91 98XXX XXXXX" — partial masking for display only
  // Authority: §34.8 "Never show OTP sent to XXXXXXXX10 (partial masking)"
  // We show the number as entered but confirm "OTP bheja gaya +91 XXXXXXXXXX"
  const displayPhone = phoneNumber; // Full number — spec says show what seller entered

  /* ── RENDER ───────────────────────────────────────────────── */
  return (
    <div>
      {/* ── CONTEXT BANNER — §34.4 ─────────────────────────── */}
      <div className="flex items-center justify-between mb-5">
        <p className="text-sm text-text-secondary">
          OTP bheja gaya{' '}
          <span className="font-semibold text-text-primary">{displayPhone}</span>
        </p>
        <button
          type="button"
          onClick={onBack}
          className="text-sm text-brand-600 font-medium hover:text-brand-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1 rounded"
          aria-label="Phone number change karein, Step 1 pe wapas jaiye"
        >
          Change
        </button>
      </div>

      {/* ── ERROR BANNER — §34.7 ───────────────────────────── */}
      {error && (
        <div
          role="alert"
          className="mb-4 px-4 py-3 rounded-lg bg-error-50 border border-error-200 text-sm text-error-700"
        >
          {error}
        </div>
      )}

      {/* ── RESEND SUCCESS MESSAGE ─────────────────────────── */}
      {resendMessage && (
        <div
          role="status"
          aria-live="polite"
          className="mb-4 px-4 py-3 rounded-lg bg-success-50 border border-success-100 text-sm text-success-700"
        >
          {resendMessage}
        </div>
      )}

      {/* ── 6-BOX OTP INPUT — §34.4 ──────────────────────── */}
      <div className="mb-5">
        <OtpInput
          ref={otpRef}
          value={otp}
          onChange={setOtp}
          onComplete={(val) => void handleVerify(val)}
          disabled={isVerifying || isExpired}
          hasError={!!error}
          className={[
            'justify-center',
            // Success flash: green override — §34.6
            successFlash ? '[&_input]:bg-success-100 [&_input]:border-success-500' : '',
            // Error shake animation — §34.7
            error ? 'animate-[shake_200ms_ease-in-out]' : '',
          ].join(' ')}
        />
      </div>

      {/* ── EXPIRY TIMER — §34.4 ────────────────────────────── */}
      <div className="text-center mb-5">
        {!isExpired ? (
          <p
            className={`text-sm ${getTimerClass()}`}
            aria-live="polite"
            aria-atomic="true"
          >
            OTP{' '}
            <span className="font-mono font-semibold">
              {timerMM}:{timerSS}
            </span>{' '}
            mein expire hoga
          </p>
        ) : (
          <p className="text-sm text-error-700 font-medium" role="alert">
            OTP expire ho gaya. Naya OTP mangaiye.
          </p>
        )}
      </div>

      {/* ── VERIFY BUTTON — §34.4 ───────────────────────────── */}
      {/* Disabled until 6 digits; auto-submits on 6th digit */}
      <Button
        type="button"
        variant="primary"
        fullWidth
        isLoading={isVerifying}
        disabled={otp.length !== 6 || isExpired}
        className="h-11 mb-4"
        onClick={() => void handleVerify(otp)}
        aria-label={isVerifying ? 'OTP verify ho raha hai, please wait' : 'OTP Verify Karein'}
      >
        {isVerifying ? 'Verify ho raha hai...' : 'Verify Karein'}
      </Button>

      {/* ── RESEND LINK — §34.4 ─────────────────────────────── */}
      <div className="text-center">
        {!isExpired ? (
          // Timer active — non-clickable, muted text
          <p className="text-sm text-text-muted">
            OTP nahi mila?{' '}
            <span className="font-mono">{timerMM}:{timerSS}</span>{' '}
            baad resend karein
          </p>
        ) : (
          // Timer expired — clickable link
          <button
            type="button"
            onClick={() => void handleResend()}
            disabled={isResending}
            className="text-sm text-brand-600 font-medium hover:text-brand-700 underline transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1 rounded disabled:opacity-50"
            aria-label="Naya OTP bhejein"
          >
            {isResending ? 'OTP bhej rahe hain...' : 'OTP nahi mila? Dobara bhejein'}
          </button>
        )}
      </div>

      {/* ── ARIA LIVE — auto-submit announcement — §34.11 ───── */}
      <span
        ref={ariaLiveRef}
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      />
    </div>
  );
}
