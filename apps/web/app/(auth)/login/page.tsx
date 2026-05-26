'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../contexts/auth.context';
import type { AuthTokensResponse } from '@vyaparnet/types';
import { SendOtpSchema, VerifyOtpSchema } from '@vyaparnet/types';

/**
 * Login Page — Phone OTP authentication.
 *
 * States: phone_input → otp_verify → success
 *
 * UX Rules (Authority: VyaparNet_Product_UX_System_v1.md Section 9.1):
 * - +91 prefix locked (not editable)
 * - Numeric keyboard triggered
 * - OTP auto-fill on Android
 * - Resend countdown (30 seconds)
 * - Hinglish labels
 * - Lockout screen with countdown
 * - Min touch targets: 44px
 */
type LoginStep = 'phone' | 'otp' | 'success';

export default function LoginPage(): JSX.Element {
  const [step, setStep] = useState<LoginStep>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendCountdown, setResendCountdown] = useState(0);
  const [lockoutSeconds, setLockoutSeconds] = useState(0);
  const { login } = useAuth();
  const router = useRouter();

  const fullPhone = `+91${phone}`;

  const handleSendOtp = async (): Promise<void> => {
    const result = SendOtpSchema.safeParse({ phoneNumber: fullPhone });
    if (!result.success) {
      setError('Valid 10-digit mobile number daalen');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/v1/auth/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: fullPhone }),
      });

      const data = await response.json() as {
        success: boolean;
        error?: { code: string; message: string; details?: { retryAfterSeconds?: number } };
      };

      if (!response.ok) {
        const retryAfter = data.error?.details?.retryAfterSeconds;
        if (data.error?.code === 'ACCOUNT_LOCKED' && retryAfter) {
          setLockoutSeconds(retryAfter);
        }
        setError(data.error?.message ?? 'Kuch problem ho gayi. Dobara try karein.');
        return;
      }

      setStep('otp');
      startResendCountdown();
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (): Promise<void> => {
    const result = VerifyOtpSchema.safeParse({ phoneNumber: fullPhone, otp });
    if (!result.success) {
      setError('6-digit OTP daalen');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/v1/auth/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: fullPhone, otp }),
      });

      const data = await response.json() as {
        success: boolean;
        data?: AuthTokensResponse;
        error?: { code: string; message: string; details?: { retryAfterSeconds?: number; attemptsRemaining?: number } };
      };

      if (!response.ok) {
        if (data.error?.code === 'ACCOUNT_LOCKED') {
          setLockoutSeconds(data.error.details?.retryAfterSeconds ?? 900);
        }
        const remaining = data.error?.details?.attemptsRemaining;
        setError(
          remaining !== undefined
            ? `Galat OTP. ${remaining} try baki hai.`
            : (data.error?.message ?? 'OTP galat hai.')
        );
        return;
      }

      if (data.data) {
        login(data.data);
        router.push('/');
      }
    } finally {
      setLoading(false);
    }
  };

  const startResendCountdown = (): void => {
    setResendCountdown(30);
    const interval = setInterval(() => {
      setResendCountdown((prev) => {
        if (prev <= 1) { clearInterval(interval); return 0; }
        return prev - 1;
      });
    }, 1000);
  };

  // ─── Lockout Screen ───────────────────────────────────────
  if (lockoutSeconds > 0) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-md bg-surface-page">
        <div className="w-full max-w-sm bg-surface rounded-lg p-lg shadow-sm border border-border">
          <div className="text-center">
            <div className="text-4xl mb-md">🔒</div>
            <h2 className="text-h2 font-heading font-bold text-text-primary mb-sm">
              Account Temporarily Locked
            </h2>
            <p className="text-body text-text-secondary mb-md">
              Bahut zyada galat OTP try kiya. {Math.ceil(lockoutSeconds / 60)} minute baad try karein.
            </p>
            <div className="text-h1 font-bold text-error mb-lg">
              {Math.floor(lockoutSeconds / 60)}:{String(lockoutSeconds % 60).padStart(2, '0')}
            </div>

            <a
              href="https://wa.me/919999999999"
              className="text-primary underline text-body"
              target="_blank"
              rel="noopener noreferrer"
            >
              Help chahiye? WhatsApp karein →
            </a>
          </div>
        </div>
      </div>
    );
  }

  // ─── Phone Input ──────────────────────────────────────────
  if (step === 'phone') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-md bg-surface-page">
        <div className="w-full max-w-sm">
          <div className="text-center mb-xl">
            <h1 className="text-h1 font-heading font-bold text-primary mb-sm">VyaparNet</h1>
            <p className="text-body text-text-secondary">Login ya register karein</p>
          </div>

          <div className="bg-surface rounded-lg p-lg shadow-sm border border-border">
            <div className="mb-md">
              <label className="text-body font-semibold text-text-primary mb-sm block">
                Mobile Number
              </label>
              <div className="flex items-center border border-border rounded focus-within:border-primary">
                <span className="px-md py-sm text-body text-text-secondary bg-surface-page border-r border-border rounded-l">
                  +91
                </span>
                <input
                  type="tel"
                  inputMode="numeric"
                  pattern="[6-9][0-9]{9}"
                  maxLength={10}
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value.replace(/\D/g, '').slice(0, 10));
                    setError(null);
                  }}
                  placeholder="10-digit number"
                  className="flex-1 px-md py-sm text-body bg-transparent outline-none min-h-[44px]"
                  autoFocus
                />
              </div>
              {error && (
                <p className="text-caption text-error mt-sm">{error}</p>
              )}
            </div>

            <button
              onClick={() => void handleSendOtp()}
              disabled={loading || phone.length !== 10}
              className="w-full bg-primary text-white text-body font-semibold rounded py-sm min-h-[48px] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Bhejna hai...' : 'OTP Send Karein'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── OTP Verification ─────────────────────────────────────
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-md bg-surface-page">
      <div className="w-full max-w-sm">
        <button
          onClick={() => { setStep('phone'); setOtp(''); setError(null); }}
          className="text-primary text-body mb-md flex items-center gap-sm min-h-[44px]"
        >
          ← Wapas
        </button>

        <div className="bg-surface rounded-lg p-lg shadow-sm border border-border">
          <h2 className="text-h2 font-heading font-bold text-text-primary mb-sm">OTP Daalen</h2>
          <p className="text-body text-text-secondary mb-md">
            +91{phone} par 6-digit OTP bheja gaya
          </p>

          <div className="mb-md">
            <input
              type="tel"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              autoComplete="one-time-code"
              value={otp}
              onChange={(e) => {
                setOtp(e.target.value.replace(/\D/g, '').slice(0, 6));
                setError(null);
              }}
              placeholder="6-digit OTP"
              className="w-full border border-border rounded px-md py-sm text-h2 font-bold text-center tracking-widest focus:border-primary outline-none min-h-[56px]"
              autoFocus
            />
            {error && (
              <p className="text-caption text-error mt-sm text-center">{error}</p>
            )}
          </div>

          <button
            onClick={() => void handleVerifyOtp()}
            disabled={loading || otp.length !== 6}
            className="w-full bg-primary text-white text-body font-semibold rounded py-sm min-h-[48px] mb-md disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Verify ho raha hai...' : 'OTP Verify Karein'}
          </button>

          <div className="text-center">
            {resendCountdown > 0 ? (
              <p className="text-caption text-text-secondary">
                Resend in {resendCountdown}s
              </p>
            ) : (
              <button
                onClick={() => void handleSendOtp()}
                disabled={loading}
                className="text-primary text-body underline min-h-[44px]"
              >
                OTP dobara bhejein
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
