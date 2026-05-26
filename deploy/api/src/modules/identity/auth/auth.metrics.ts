import { Injectable } from '@nestjs/common';

/**
 * AuthMetrics — Prometheus-compatible counter interface for auth events.
 *
 * In Sprint 1: implemented as simple in-memory counters.
 * Sprint 9 (Hardening): replace with @willsoto/nestjs-prometheus proper counters.
 *
 * Authority: VyaparNet_Deployment_Runtime_Architecture_v1.md Section 12
 */
@Injectable()
export class AuthMetrics {
  private readonly counters: Map<string, number> = new Map();

  increment(metric: string, labels?: Record<string, string>): void {
    const key = labels
      ? `${metric}{${Object.entries(labels)
          .map(([k, v]) => `${k}="${v}"`)
          .join(',')}}`
      : metric;
    this.counters.set(key, (this.counters.get(key) ?? 0) + 1);
  }

  getAll(): Record<string, number> {
    return Object.fromEntries(this.counters);
  }

  // ─── Named methods for type safety ───────────────────────────

  otpSent(): void {
    this.increment('auth_otp_sent_total');
  }
  otpVerified(role: string): void {
    this.increment('auth_otp_verified_total', { role });
  }
  otpFailed(reason: string): void {
    this.increment('auth_otp_failed_total', { reason });
  }
  loginSuccess(role: string): void {
    this.increment('auth_login_total', { role });
  }
  lockoutTriggered(): void {
    this.increment('auth_lockout_total');
  }
  tokenRefreshed(): void {
    this.increment('auth_token_refresh_total');
  }
  loggedOut(): void {
    this.increment('auth_logout_total');
  }
  loggedOutAll(): void {
    this.increment('auth_logout_all_total');
  }
}
