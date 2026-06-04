/**
 * Auth API Client — apps/seller-dashboard/lib/api/auth.client.ts
 *
 * Authority: seller_dashboard_architecture.md §9 (Route Architecture — /login)
 *            seller_dashboard_uxui_system.md §34.12 (Login Build Priority)
 *
 * API Contracts (verified against auth.controller.ts):
 *   POST /api/v1/auth/otp/send
 *     Body:    { phoneNumber: "+91XXXXXXXXXX" }
 *     Success: { success: true, data: { message: string; expiresIn: number } }
 *     Error:   { success: false, error: { code: string; message: string; details?: {...} } }
 *
 *   POST /api/v1/auth/otp/verify
 *     Body:    { phoneNumber: "+91XXXXXXXXXX", otp: "123456", deviceId: "<UUID>" }
 *     Success: { success: true, data: AuthTokensResponse }
 *     Error:   OTP_INVALID, OTP_EXPIRED, RATE_LIMITED, ACCOUNT_SUSPENDED, ACCOUNT_LOCKED
 *
 * CRITICAL: VerifyOtpSchema requires `deviceId` (UUID). Generated client-side + stored in
 * a session-scoped variable (NOT localStorage). Cleared on logout.
 * Ref: packages/types/src/auth/schemas.ts VerifyOtpSchema
 *
 * NEVER imports apiFetch — auth routes are @Public() and carry no Bearer token.
 */

import { buildApiUrl } from '../config';
import type { AuthTokensResponse } from '@vyaparnet/types';

/* ── RESULT TYPES ─────────────────────────────────────────────── */
export interface SendOtpResult {
  success: true;
  expiresIn: number;   // OTP TTL in seconds (from server — typically 300)
  message: string;
}

export interface VerifyOtpResult {
  success: true;
  tokens: AuthTokensResponse;
}

export interface AuthApiError {
  success: false;
  error: string;           // User-facing Hinglish message
  code?: string;           // Backend error code: OTP_INVALID | OTP_EXPIRED | RATE_LIMITED | etc.
  retryAfterSeconds?: number; // For RATE_LIMITED / ACCOUNT_LOCKED states
  attemptsRemaining?: number; // For OTP_INVALID with remaining attempts
}

export type SendOtpApiResult = SendOtpResult | AuthApiError;
export type VerifyOtpApiResult = VerifyOtpResult | AuthApiError;

/* ── ERROR CODE → HINGLISH MESSAGE MAP ───────────────────────── */
// Authority: seller_dashboard_uxui_system.md §34.7 (Error States)
function mapErrorCode(code: string | undefined, fallback: string): string {
  switch (code) {
    case 'OTP_INVALID':         return 'OTP galat hai. Dobara check karein.';
    case 'OTP_EXPIRED':         return 'OTP expire ho gaya. Naya OTP mangaiye.';
    case 'RATE_LIMITED':        return 'Bahut zyada OTP requests bheje. Kuch der baad try karein.';
    case 'ACCOUNT_SUSPENDED':   return 'Aapka account suspend hai. Support se contact karein: support@vyaparnet.com';
    case 'ACCOUNT_LOCKED':      return 'Account temporarily lock ho gaya. Thodi der baad try karein.';
    case 'PHONE_NOT_REGISTERED':return 'Yeh number registered nahi hai. Admin se contact karein.';
    default:                    return fallback || 'Kuch galat hua. Dobara try karein.';
  }
}

/* ── SEND OTP ─────────────────────────────────────────────────── */
/**
 * POST /api/v1/auth/otp/send
 * Sends OTP to the provided phone number.
 *
 * @param phoneNumber - Full number with +91 prefix: "+91XXXXXXXXXX"
 */
export async function sendOtp(phoneNumber: string): Promise<SendOtpApiResult> {
  try {
    const res = await fetch(buildApiUrl('/auth/otp/send'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumber }),
    });

    const body = await res.json() as {
      success: boolean;
      data?: { message: string; expiresIn: number };
      error?: { code?: string; message?: string; details?: { retryAfterSeconds?: number } };
    };

    if (!res.ok || !body.success) {
      const code = body.error?.code;
      const retryAfter = body.error?.details?.retryAfterSeconds;
      return {
        success: false,
        error: mapErrorCode(code, body.error?.message ?? 'OTP nahi bheja ja saka. Dobara try karein.'),
        code,
        retryAfterSeconds: retryAfter,
      };
    }

    return {
      success: true,
      expiresIn: body.data?.expiresIn ?? 300,
      message: body.data?.message ?? 'OTP bheja gaya.',
    };

  } catch {
    const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
    return {
      success: false,
      error: isOffline
        ? 'Internet nahi hai. Connection check karein.'
        : 'Server se connect nahi ho pa raha. Dobara try karein.',
    };
  }
}

/* ── VERIFY OTP ───────────────────────────────────────────────── */
/**
 * POST /api/v1/auth/otp/verify
 * Verifies the OTP and returns auth tokens on success.
 *
 * @param phoneNumber - Full number with +91 prefix
 * @param otp         - 6-digit OTP string
 * @param deviceId    - Client-generated UUID for session tracking (required by backend schema)
 */
export async function verifyOtp(
  phoneNumber: string,
  otp: string,
  deviceId: string,
): Promise<VerifyOtpApiResult> {
  try {
    const res = await fetch(buildApiUrl('/auth/otp/verify'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumber, otp, deviceId }),
    });

    const body = await res.json() as {
      success: boolean;
      data?: AuthTokensResponse;
      error?: {
        code?: string;
        message?: string;
        details?: { retryAfterSeconds?: number; attemptsRemaining?: number };
      };
    };

    if (!res.ok || !body.success) {
      const code = body.error?.code;
      const retryAfter = body.error?.details?.retryAfterSeconds;
      const attempts = body.error?.details?.attemptsRemaining;

      // Special case: OTP_INVALID with remaining attempts → show count
      let errorMsg = mapErrorCode(code, body.error?.message ?? 'Verification fail hua.');
      if (code === 'OTP_INVALID' && attempts !== undefined && attempts > 0) {
        errorMsg = `OTP galat hai. ${attempts} attempt baki hai.`;
      }

      return {
        success: false,
        error: errorMsg,
        code,
        retryAfterSeconds: retryAfter,
        attemptsRemaining: attempts,
      };
    }

    if (!body.data) {
      return { success: false, error: 'Login response invalid hai. Dobara try karein.' };
    }

    return { success: true, tokens: body.data };

  } catch {
    const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
    return {
      success: false,
      error: isOffline
        ? 'Internet nahi hai. Connection check karein.'
        : 'Server se connect nahi ho pa raha. Dobara try karein.',
    };
  }
}
