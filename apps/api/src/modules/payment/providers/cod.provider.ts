import { Injectable, NotImplementedException } from '@nestjs/common';
import type {
  PaymentProvider,
  PaymentProviderOrder,
  PaymentCaptureResult,
  RefundResult,
  PaymentOrderMetadata,
} from '@vyaparnet/types';

/**
 * CodPaymentProvider — §9.3
 *
 * Authority: SPRINT_4_EXECUTION_LOCK_FINAL.md §9.3
 *
 * GOVERNANCE LAWS:
 *  - HARDENED (INV-32): providerOrderId uses metadata.orderId — NEVER Date.now().
 *    Date.now() is non-deterministic. On retry, the providerOrderId would change,
 *    causing reconciliation confusion.
 *  - capturePayment() is a stub — COD capture is implicit via synthetic Payment
 *    record created inside the COD order $transaction (INV-26).
 *  - verifyWebhookSignature() always returns true — COD has no webhooks.
 *  - No external HTTP calls in any method.
 */
@Injectable()
export class CodPaymentProvider implements PaymentProvider {
  /**
   * Creates a synthetic COD "order" — no external call.
   *
   * HARDENED (INV-32): providerOrderId MUST be `cod-{metadata.orderId}`.
   * This is deterministic — safe for idempotency retries.
   */
  createOrder(
    _amount: number,
    _currency: string,
    metadata: PaymentOrderMetadata,
  ): Promise<PaymentProviderOrder> {
    return Promise.resolve({
      providerOrderId: `cod-${metadata.orderId}`, // HARDENED (INV-32): orderId-based, deterministic
      amount: 0,
      currency: 'INR',
      checkoutUrl: undefined,
      metadata: {},
    });
  }

  /**
   * COD has no webhooks — signature verification always passes.
   */
  verifyWebhookSignature(_payload: Buffer, _signature: string, _secret: string): boolean {
    return true;
  }

  /**
   * COD capture is implicit (synthetic Payment created inside order $transaction, INV-26).
   * This stub exists to satisfy the PaymentProvider interface.
   */
  capturePayment(_providerOrderId: string): Promise<PaymentCaptureResult> {
    throw new NotImplementedException(
      'COD capture is handled inside order $transaction (INV-26) — capturePayment() is a stub',
    );
  }

  /**
   * COD is always "captured" at creation.
   */
  getPaymentStatus(_providerOrderId: string): Promise<{
    status: 'CAPTURED';
    capturedAt: Date;
  }> {
    return Promise.resolve({ status: 'CAPTURED', capturedAt: new Date() });
  }

  refundPayment(
    _providerPaymentId: string,
    _amount: number,
    _reason: string,
  ): Promise<RefundResult> {
    throw new NotImplementedException('COD refund activated in Sprint 8');
  }
}
