import { Injectable } from '@nestjs/common';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { Counter, Gauge, Histogram } from 'prom-client';

@Injectable()
export class MetricsService {
  constructor(
    // Cart metrics
    @InjectMetric('cart_item_count_total')
    public readonly cartItemCountTotal: Counter<string>,
    @InjectMetric('cart_checkout_initiated_total')
    public readonly cartCheckoutInitiatedTotal: Counter<string>,
    @InjectMetric('cart_abandoned_total')
    public readonly cartAbandonedTotal: Counter<string>,
    @InjectMetric('cart_warning_surfaced_total')
    public readonly cartWarningSurfacedTotal: Counter<string>,

    // Checkout funnel
    @InjectMetric('checkout_funnel_step_total')
    public readonly checkoutFunnelStepTotal: Counter<string>,

    // Order metrics
    @InjectMetric('order_created_total')
    public readonly orderCreatedTotal: Counter<string>,
    @InjectMetric('order_confirmed_total')
    public readonly orderConfirmedTotal: Counter<string>,
    @InjectMetric('order_cancelled_total')
    public readonly orderCancelledTotal: Counter<string>,
    @InjectMetric('order_payment_failed_total')
    public readonly orderPaymentFailedTotal: Counter<string>,
    @InjectMetric('order_stuck_in_placed_total')
    public readonly orderStuckInPlacedTotal: Gauge<string>,
    @InjectMetric('order_number_collision_total')
    public readonly orderNumberCollisionTotal: Counter<string>,

    // Sprint 5 Metrics
    @InjectMetric('order_status_transition_total')
    public readonly orderStatusTransitionTotal: Counter<string>,
    @InjectMetric('seller_dispatch_time_hours')
    public readonly sellerDispatchTimeHours: Histogram<string>,
    @InjectMetric('buyer_reorder_total')
    public readonly buyerReorderTotal: Counter<string>,
    @InjectMetric('seller_kpi_query_latency_ms')
    public readonly sellerKpiQueryLatencyMs: Histogram<string>,
    @InjectMetric('dispatch_proof_upload_total')
    public readonly dispatchProofUploadTotal: Counter<string>,
    @InjectMetric('seller_scorecard_run_total')
    public readonly sellerScorecardRunTotal: Counter<string>,
    @InjectMetric('seller_scorecard_latency_ms')
    public readonly sellerScorecardLatencyMs: Histogram<string>,
    @InjectMetric('seller_scorecard_dlq_size')
    public readonly sellerScorecardDlqSize: Gauge<string>,
    @InjectMetric('kpi_redis_bypass_total')
    public readonly kpiRedisBypassTotal: Counter<string>,
    @InjectMetric('seller_context_guard_cache_miss_total')
    public readonly sellerContextGuardCacheMissTotal: Counter<string>,

    // Payment metrics
    @InjectMetric('payment_initiated_total')
    public readonly paymentInitiatedTotal: Counter<string>,
    @InjectMetric('payment_success_total')
    public readonly paymentSuccessTotal: Counter<string>,
    @InjectMetric('payment_failed_total')
    public readonly paymentFailedTotal: Counter<string>,
    @InjectMetric('payment_webhook_received_total')
    public readonly paymentWebhookReceivedTotal: Counter<string>,
    @InjectMetric('payment_webhook_duplicate_total')
    public readonly paymentWebhookDuplicateTotal: Counter<string>,
    @InjectMetric('payment_webhook_invalid_signature_total')
    public readonly paymentWebhookInvalidSignatureTotal: Counter<string>,
    @InjectMetric('payment_webhook_queue_timeout_total')
    public readonly paymentWebhookQueueTimeoutTotal: Counter<string>,
    @InjectMetric('payment_reconciliation_run_total')
    public readonly paymentReconciliationRunTotal: Counter<string>,
    @InjectMetric('payment_reconciliation_missed_total')
    public readonly paymentReconciliationMissedTotal: Counter<string>,
    @InjectMetric('payment_reconciliation_latency_ms')
    public readonly paymentReconciliationLatencyMs: Histogram<string>,
    @InjectMetric('payment_retry_redis_premature_eviction_total')
    public readonly paymentRetryRedisPrematureEvictionTotal: Counter<string>,

    // Queue metrics
    @InjectMetric('bullmq_payment_queue_depth')
    public readonly bullmqPaymentQueueDepth: Gauge<string>,
    @InjectMetric('bullmq_payment_webhook_worker_latency_ms')
    public readonly bullmqPaymentWebhookWorkerLatencyMs: Histogram<string>,
    @InjectMetric('bullmq_payment_dlq_size')
    public readonly bullmqPaymentDlqSize: Gauge<string>,

    // Infrastructure metrics
    @InjectMetric('redis_unavailable_total')
    public readonly redisUnavailableTotal: Counter<string>,
    @InjectMetric('rate_limit_atomic_failure_total')
    public readonly rateLimitAtomicFailureTotal: Counter<string>,
    @InjectMetric('webhook_double_consume_prevented_total')
    public readonly webhookDoubleConsumePreventedTotal: Counter<string>,

    // ─── Sprint 8: Trust & Safety, Procurement, Financial ────────────────────────
    // Return metrics
    @InjectMetric('return_requests_total')
    public readonly returnRequestsTotal: Counter<string>,
    @InjectMetric('return_sla_breach_total')
    public readonly returnSlaBreachTotal: Counter<string>,
    @InjectMetric('return_qc_approval_rate')
    public readonly returnQcApprovalRate: Gauge<string>,
    @InjectMetric('return_refund_amount_total')
    public readonly returnRefundAmountTotal: Counter<string>,

    // Dispute metrics
    @InjectMetric('dispute_opened_total')
    public readonly disputeOpenedTotal: Counter<string>,
    @InjectMetric('dispute_resolved_total')
    public readonly disputeResolvedTotal: Counter<string>,
    @InjectMetric('dispute_sla_breach_total')
    public readonly disputeSlaBreachTotal: Counter<string>,
    @InjectMetric('dispute_resolution_time_seconds')
    public readonly disputeResolutionTimeSeconds: Histogram<string>,
    @InjectMetric('dispute_payout_hold_total')
    public readonly disputePayoutHoldTotal: Counter<string>,

    // RFQ metrics
    @InjectMetric('rfq_created_total')
    public readonly rfqCreatedTotal: Counter<string>,
    @InjectMetric('quote_submitted_total')
    public readonly quoteSubmittedTotal: Counter<string>,
    @InjectMetric('quote_accepted_total')
    public readonly quoteAcceptedTotal: Counter<string>,
    @InjectMetric('quote_converted_to_order_total')
    public readonly quoteConvertedToOrderTotal: Counter<string>,
    @InjectMetric('quote_expiry_total')
    public readonly quoteExpiryTotal: Counter<string>,

    // Refund metrics
    @InjectMetric('refund_initiated_total')
    public readonly refundInitiatedTotal: Counter<string>,
    @InjectMetric('refund_amount_total')
    public readonly refundAmountTotal: Gauge<string>,
    @InjectMetric('buyer_ledger_entries_total')
    public readonly buyerLedgerEntriesTotal: Counter<string>,
  ) {}
}
