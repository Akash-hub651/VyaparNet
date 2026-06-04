'use client';

/**
 * SellerLoginPage — apps/seller-dashboard/app/(auth)/login/page.tsx
 *
 * Authority:
 *   seller_dashboard_uxui_system.md §34 (Login & Authentication UX — UXREV-C-4 RESOLVED)
 *   seller_dashboard_architecture.md §9 (Route: /login, API: POST /auth/otp/send + /verify)
 *   seller_dashboard_screen_system.md §G (Global Standards — Accessibility, Mobile)
 *
 * Layout (§34.2):
 *   Desktop lg+: Split screen — Left 5/12 brand panel (dark) + Right 7/12 auth form
 *   Mobile <lg:  Single column — brand panel hidden, form full width
 *
 * Device ID: VerifyOtpSchema requires a UUID deviceId for session tracking.
 * Generated once on mount and kept in component state (NOT localStorage — security rule).
 *
 * Flow:
 *   phone → [POST /auth/otp/send] → otp → [POST /auth/otp/verify] → /dashboard
 *
 * If already authenticated: redirects to /dashboard immediately.
 */

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '../../contexts/auth.context';
import { sendOtp, verifyOtp } from '../../../lib/api/auth.client';
import { FullPageLoader } from '../../../components/ui/Skeleton';
import { PhoneStep } from './PhoneStep';
import { OtpStep } from './OtpStep';

/* ── PAGE METADATA — §34.11 */
// Authority: §34.11 "Page title: Login — VyaparNet Seller Hub"
// Since this is a Client Component, metadata is set via <title> in <head> of RootLayout.
// Title is handled in layout.tsx. Documented here for reference.

type LoginStep = 'phone' | 'otp';

/* ── DEVICE ID GENERATOR ──────────────────────────────────────── */
// Required by VerifyOtpSchema — client-generated UUID for session tracking
// Stored in component state only (never localStorage — security invariant)
function generateDeviceId(): string {
  // crypto.randomUUID() is available in modern browsers and Node 14.17+
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for older browsers
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/* ── BRAND PANEL ─────────────────────────────────────────────── */
// Authority: §34.2 Brand panel — desktop left 5/12
function BrandPanel(): React.JSX.Element {
  return (
    <div className="hidden lg:flex flex-col justify-between h-full bg-surface-sidebar px-10 py-12">
      {/* Logo */}
      <div>
        <div className="flex items-center gap-2 mb-12">
          {/* VyaparNet wordmark */}
          <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center flex-shrink-0">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M9 22V12h6v10" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <span className="text-xl font-bold text-white tracking-tight">VyaparNet</span>
        </div>

        {/* Tagline — §34.2 */}
        <h2 className="text-2xl font-bold text-white leading-snug mb-3">
          Bharat ke B2B sellers<br />ka digital hub
        </h2>
        <p className="text-sm text-white/60 mb-10">
          Apna seller account manage karein — orders, inventory, RFQ sab ek jagah.
        </p>

        {/* Value props — §34.2 */}
        <ul className="space-y-4" aria-label="VyaparNet features">
          {[
            { icon: '📦', text: 'Real-time order tracking' },
            { icon: '⚡', text: 'RFQ quoting in minutes' },
            { icon: '🧾', text: 'GST-ready invoicing' },
          ].map(({ icon, text }) => (
            <li key={text} className="flex items-center gap-3 text-sm text-white/80">
              <span className="text-base" aria-hidden="true">{icon}</span>
              <span>{text}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Footer — §34.2 */}
      <p className="text-xs text-white/40">
        India&apos;s B2B marketplace
      </p>
    </div>
  );
}

/* ── MAIN INNER COMPONENT (uses useSearchParams — needs Suspense) ── */
// Authority: Next.js App Router requires useSearchParams to be wrapped in Suspense
// for static prerendering. Default export wraps this in Suspense below.
function SellerLoginContent(): React.JSX.Element {
  const { isLoading, isAuthenticated, login } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [step, setStep] = useState<LoginStep>('phone');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otpExpiresIn, setOtpExpiresIn] = useState(300);
  // Device ID — generated once, kept in state (not localStorage)
  const [deviceId] = useState(() => generateDeviceId());

  // Redirect target from query param (§34.7 session expired redirect)
  const redirectTo = searchParams.get('redirect') ?? '/dashboard';

  /* ── ALREADY AUTHENTICATED — redirect immediately ─────────── */
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace(redirectTo);
    }
  }, [isLoading, isAuthenticated, router, redirectTo]);

  /* ── HANDLERS ─────────────────────────────────────────────── */
  const handleSendOtp = useCallback(async (phone: string) => {
    return sendOtp(phone);
  }, []);

  const handlePhoneSuccess = useCallback((phone: string, expiresIn: number) => {
    setPhoneNumber(phone);
    setOtpExpiresIn(expiresIn);
    setStep('otp');
  }, []);

  const handleVerifyOtp = useCallback(async (otp: string) => {
    const result = await verifyOtp(phoneNumber, otp, deviceId);
    if (result.success) {
      // Store tokens in auth context (in-memory — never localStorage)
      login(result.tokens);
    }
    return result;
  }, [phoneNumber, deviceId, login]);

  const handleOtpSuccess = useCallback(() => {
    // Auth context login() triggers profile fetch → isAuthenticated → useEffect redirects
    // Small delay to allow state propagation
    setTimeout(() => {
      router.replace(redirectTo);
    }, 350);
  }, [router, redirectTo]);

  const handleResendOtp = useCallback(async () => {
    const result = await sendOtp(phoneNumber);
    if (result.success) {
      setOtpExpiresIn(result.expiresIn);
    }
    return result;
  }, [phoneNumber]);

  const handleBack = useCallback(() => {
    setStep('phone');
    setPhoneNumber('');
    setOtpExpiresIn(300);
  }, []);

  /* ── AUTH LOADING — show full page loader ─────────────────── */
  if (isLoading) return <FullPageLoader />;

  /* ── PAGE RENDER ──────────────────────────────────────────── */
  return (
    <>
      {/* Skip link for keyboard users */}
      <a href="#login-form" className="skip-link">
        Login form pe jaiye
      </a>

      {/* Aria live region for page-level announcements */}
      <div aria-live="polite" aria-atomic="true" className="sr-only" id="login-announcer" />

      <div className="min-h-screen flex">

        {/* ── LEFT: BRAND PANEL (desktop only) — §34.2 ─────── */}
        <div className="lg:w-5/12 xl:w-5/12 flex-shrink-0">
          <BrandPanel />
        </div>

        {/* ── RIGHT: AUTH FORM PANEL ────────────────────────── */}
        {/*
          Desktop: 7/12 width, white bg, centered form
          Mobile:  Full width, white bg, centered form
          Authority: §34.2
        */}
        <div className="flex-1 flex flex-col items-center justify-center bg-surface-card px-4 py-8 lg:px-8 lg:py-12">
          <div className="w-full max-w-[360px]" id="login-form">

            {/* Mobile logo (hidden on desktop — brand panel has it) */}
            <div className="flex items-center gap-2 mb-8 lg:hidden">
              <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M9 22V12h6v10" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <span className="text-lg font-bold text-text-primary">VyaparNet</span>
            </div>

            {/* Page heading — §34.11 "h1: Seller Hub mein login karein" */}
            <div className="mb-8">
              <h1 className="text-xl font-semibold text-text-primary">
                Seller Hub mein login karein
              </h1>
              <p className="text-sm text-text-secondary mt-1">
                {step === 'phone'
                  ? 'Apna registered mobile number enter karein'
                  : '6-digit OTP enter karein jo aapke phone par aaya hai'}
              </p>
            </div>

            {/* ── STEP INDICATOR ──────────────────────────────── */}
            <div
              className="flex items-center gap-2 mb-6"
              aria-label="Login step"
              role="progressbar"
              aria-valuenow={step === 'phone' ? 1 : 2}
              aria-valuemin={1}
              aria-valuemax={2}
            >
              <div className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                step === 'phone' ? 'bg-brand-600 text-white' : 'bg-success-100 text-success-700'
              }`}>
                {step === 'phone' ? '1' : '✓'}
              </div>
              <div className={`flex-1 h-0.5 ${step === 'otp' ? 'bg-brand-600' : 'bg-border-default'}`} />
              <div className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                step === 'otp' ? 'bg-brand-600 text-white' : 'bg-neutral-100 text-text-muted'
              }`}>
                2
              </div>
            </div>

            {/* ── FORM CONTENT ──────────────────────────────────── */}
            {step === 'phone' && (
              <PhoneStep
                onSuccess={handlePhoneSuccess}
                onSendOtp={handleSendOtp}
              />
            )}

            {step === 'otp' && (
              <OtpStep
                phoneNumber={phoneNumber}
                expiresIn={otpExpiresIn}
                onSuccess={handleOtpSuccess}
                onBack={handleBack}
                onVerifyOtp={handleVerifyOtp}
                onResendOtp={handleResendOtp}
              />
            )}

            {/* ── FOOTER ─────────────────────────────────────── */}
            <div className="mt-8 pt-6 border-t border-border-default">
              <p className="text-xs text-text-muted text-center">
                Login karke aap VyaparNet ke{' '}
                <a
                  href="https://vyaparnet.com/terms"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand-600 hover:underline"
                >
                  Terms of Service
                </a>
                {' '}aur{' '}
                <a
                  href="https://vyaparnet.com/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand-600 hover:underline"
                >
                  Privacy Policy
                </a>
                {' '}se agree karte hain.
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/* ── DEFAULT EXPORT — Suspense wrapper required by Next.js ──── */
// useSearchParams() inside SellerLoginContent requires Suspense boundary
// for static prerendering in Next.js App Router.
// Authority: https://nextjs.org/docs/messages/missing-suspense-with-csr-bailout
export default function SellerLoginPage(): React.JSX.Element {
  return (
    <Suspense fallback={<FullPageLoader />}>
      <SellerLoginContent />
    </Suspense>
  );
}

