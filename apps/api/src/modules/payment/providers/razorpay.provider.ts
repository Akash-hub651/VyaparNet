import * as crypto from 'crypto';
import { Injectable, Logger, NotImplementedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Razorpay from 'razorpay';
import type { AppConfig } from '../../../core/config/config.schema';
import type {
  PaymentProvider,
  PaymentProviderOrder,
  PaymentCaptureResult,
  RefundResult,
  PaymentOrderMetadata,
} from '@vyaparnet/types';

/**
 * RazorpayPaymentProvider — §9.2
 *
 * Authority: SPRINT_4_EXECUTION_LOCK_FINAL.md §9.2
 *
 * GOVERNANCE LAWS:
 *  - This is the ONLY file in the entire codebase allowed to import Razorpay SDK.
 *  - verifyWebhookSignature MUST use crypto.timingSafeEqual (§9.2, §15.1).
 *  - createOrder MUST be called OUTSIDE any $transaction (HTTP call forbidden inside tx).
 *  - refundPayment throws NotImplementedException — Sprint 8 activates this.
 */
@Injectable()
export class RazorpayPaymentProvider implements PaymentProvider {
  private readonly razorpay: Razorpay;
  private readonly logger = new Logger(RazorpayPaymentProvider.name);

  constructor(private readonly config: ConfigService<AppConfig, true>) {
    // HARDENED: Razorpay SDK instantiated once at DI construction — never inline
    this.razorpay = new Razorpay({
      key_id: this.config.get('RAZORPAY_KEY_ID'),
      key_secret: this.config.get('RAZORPAY_KEY_SECRET'),
    });
  }

  async createOrder(
    amount: number,
    currency: string,
    metadata: PaymentOrderMetadata,
  ): Promise<PaymentProviderOrder> {
    // HARDENED: This is an HTTP call — MUST be called OUTSIDE $transaction (§3.1)
    this.logger.log(
      { orderId: metadata.orderId, amount, currency },
      'Creating Razorpay order',
    );

    const response = await this.razorpay.orders.create({
      amount, // in paise
      currency,
      receipt: metadata.orderId, // max 40 chars
      notes: {
        orderId: metadata.orderId,
        buyerId: metadata.buyerId,
      },
    });

    return {
      providerOrderId: response.id, // razorpay order_xxxxx
      amount:
        typeof response.amount === 'number'
          ? response.amount
          : Number(response.amount),
      currency: response.currency,
      // Checkout URL is constructed client-side using razorpay.js + key_id + providerOrderId
      checkoutUrl: undefined,
      metadata: {
        razorpayOrderId: response.id,
        receipt: metadata.orderId,
      },
    };
  }

  /**
   * Verifies Razorpay webhook HMAC signature.
   *
   * HARDENED (§9.2, §15.1): MUST use crypto.timingSafeEqual — never string comparison.
   * String comparison is vulnerable to timing attacks (≥0.01ms diff reveals match prefix).
   *
   * @param payload   Raw request body Buffer (BEFORE JSON.parse)
   * @param signature x-razorpay-signature header value
   * @param secret    RAZORPAY_WEBHOOK_SECRET from config
   */
  verifyWebhookSignature(
    payload: Buffer,
    signature: string,
    secret: string,
  ): boolean {
    try {
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(payload)
        .digest('hex');

      // HARDENED (§15.1): timing-safe comparison — prevents timing oracle attacks
      return crypto.timingSafeEqual(
        Buffer.from(expectedSignature, 'hex'),
        Buffer.from(signature, 'hex'),
      );
    } catch (err) {
      // Buffer.from will throw if signature is not valid hex (malformed request)
      this.logger.warn(
        { err },
        'SECURITY: Webhook signature verification failed — possible malformed request',
      );
      return false;
    }
  }

  async capturePayment(providerOrderId: string): Promise<PaymentCaptureResult> {
    // Used by reconciliation worker — Razorpay auto-captures on payment.captured webhook
    this.logger.log(
      { providerOrderId },
      'Polling Razorpay for payment status (reconciliation path)',
    );

    const payments = await this.razorpay.orders.fetchPayments(providerOrderId);
    const captured = (payments as any).items?.find(
      (p: any) => p.status === 'captured',
    );

    if (!captured) {
      throw new Error(
        `No captured payment found for Razorpay order ${providerOrderId}`,
      );
    }

    return {
      providerPaymentId: captured.id,
      capturedAt: new Date(captured.created_at * 1000),
      amount: captured.amount,
      status: 'CAPTURED',
    };
  }

  async refundPayment(
    _providerPaymentId: string,
    _amount: number,
    _reason: string,
  ): Promise<RefundResult> {
    // Sprint 8 activates refund — do NOT implement now (§9.2)
    throw new NotImplementedException('Refund will be activated in Sprint 8');
  }

  async getPaymentStatus(providerOrderId: string): Promise<{
    status: 'PENDING' | 'CAPTURED' | 'FAILED' | 'EXPIRED';
    capturedAt?: Date;
    failedReason?: string;
  }> {
    try {
      const payments =
        await this.razorpay.orders.fetchPayments(providerOrderId);
      const items = (payments as any).items ?? [];

      const captured = items.find((p: any) => p.status === 'captured');
      if (captured) {
        return {
          status: 'CAPTURED',
          capturedAt: new Date(captured.created_at * 1000),
        };
      }

      const failed = items.find((p: any) => p.status === 'failed');
      if (failed) {
        return {
          status: 'FAILED',
          failedReason: failed.error_description ?? 'Payment failed',
        };
      }

      return { status: 'PENDING' };
    } catch (err) {
      this.logger.error(
        { providerOrderId, err },
        'Failed to fetch Razorpay payment status',
      );
      throw err;
    }
  }
}
