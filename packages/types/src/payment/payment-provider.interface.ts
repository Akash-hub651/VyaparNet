/**
 * PaymentProvider Interface — §9.1 Canonical Definition
 *
 * Authority: SPRINT_4_EXECUTION_LOCK_FINAL.md §9.1
 * This interface is the ONLY contract between PaymentService and payment gateways.
 * Razorpay SDK is NEVER imported outside razorpay.provider.ts.
 */

export interface PaymentProviderOrder {
  providerOrderId: string;  // Razorpay order_xxxxx or synthetic cod-{orderId}
  amount: number;           // in paise (smallest currency unit)
  currency: string;
  checkoutUrl?: string;     // Razorpay checkout URL (undefined for COD)
  metadata: Record<string, string>;
}

export interface PaymentCaptureResult {
  providerPaymentId: string;
  capturedAt: Date;
  amount: number;
  status: 'CAPTURED' | 'FAILED';
}

export interface RefundResult {
  refundId: string;
  amount: number;
  status: 'INITIATED' | 'PROCESSED' | 'FAILED';
}

export interface PaymentOrderMetadata {
  orderId: string;
  buyerId: string;
  description: string;
}

export interface PaymentProvider {
  /**
   * Creates a payment order with the gateway.
   * MUST be called OUTSIDE any database $transaction.
   */
  createOrder(
    amount: number,
    currency: string,
    metadata: PaymentOrderMetadata,
  ): Promise<PaymentProviderOrder>;

  /**
   * Verifies a webhook HMAC signature.
   * MUST use crypto.timingSafeEqual — never string comparison (§9.2).
   *
   * @param payload  Raw body as Uint8Array/Buffer (BEFORE JSON.parse)
   * @param signature  x-razorpay-signature header value
   * @param secret   Webhook secret from config
   */
  verifyWebhookSignature(payload: Uint8Array, signature: string, secret: string): boolean;

  /**
   * Captures a previously authorized payment.
   * Only called by reconciliation worker. COD throws NotImplemented.
   */
  capturePayment(providerOrderId: string): Promise<PaymentCaptureResult>;

  /**
   * Refunds a captured payment. Sprint 4: throws NotImplementedException.
   */
  refundPayment(
    providerPaymentId: string,
    amount: number,
    reason: string,
  ): Promise<RefundResult>;

  /**
   * Polls the gateway for payment status.
   * Used by PaymentReconciliationWorker.
   */
  getPaymentStatus(providerOrderId: string): Promise<{
    status: 'PENDING' | 'CAPTURED' | 'FAILED' | 'EXPIRED';
    capturedAt?: Date;
    failedReason?: string;
  }>;
}

/** DI injection token — avoids circular import of concrete class. */
export const PAYMENT_PROVIDER_TOKEN = 'PAYMENT_PROVIDER';
