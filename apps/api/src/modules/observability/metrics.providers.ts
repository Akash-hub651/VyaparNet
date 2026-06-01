import {
  makeCounterProvider,
  makeGaugeProvider,
  makeHistogramProvider,
} from '@willsoto/nestjs-prometheus';

export const metricProviders = [
  // Cart metrics
  makeCounterProvider({
    name: 'cart_item_count_total',
    help: 'Total count of cart item actions',
    labelNames: ['segment', 'action'],
  }),
  makeCounterProvider({
    name: 'cart_checkout_initiated_total',
    help: 'Total checkouts initiated from cart',
    labelNames: ['segment'],
  }),
  makeCounterProvider({
    name: 'cart_abandoned_total',
    help: 'Total carts abandoned',
    labelNames: ['segment'],
  }),
  makeCounterProvider({
    name: 'cart_warning_surfaced_total',
    help: 'Total cart warnings surfaced',
    labelNames: ['warning_type'],
  }),

  // Checkout funnel
  makeCounterProvider({
    name: 'checkout_funnel_step_total',
    help: 'Total checkout steps hit',
    labelNames: ['step'],
  }),

  // Order metrics
  makeCounterProvider({
    name: 'order_created_total',
    help: 'Total orders created',
    labelNames: ['payment_method', 'segment'],
  }),
  makeCounterProvider({
    name: 'order_confirmed_total',
    help: 'Total orders confirmed',
    labelNames: ['payment_method'],
  }),
  makeCounterProvider({
    name: 'order_cancelled_total',
    help: 'Total orders cancelled',
    labelNames: ['reason', 'actor'],
  }),
  makeCounterProvider({
    name: 'order_payment_failed_total',
    help: 'Total orders where payment failed',
    labelNames: ['reason'],
  }),
  makeGaugeProvider({
    name: 'order_stuck_in_placed_total',
    help: 'Total orders stuck in PLACED state for > 30 mins',
  }),
  makeCounterProvider({
    name: 'order_number_collision_total',
    help: 'Total order number collisions on creation',
  }),

  // Sprint 5 Metrics
  makeCounterProvider({
    name: 'order_status_transition_total',
    help: 'Track every status transition',
    labelNames: ['from', 'to', 'actor'],
  }),
  makeHistogramProvider({
    name: 'seller_dispatch_time_hours',
    help: 'CONFIRMED->SHIPPED latency',
    labelNames: ['segment'],
  }),
  makeCounterProvider({
    name: 'buyer_reorder_total',
    help: 'Total reorders initiated by buyers',
    labelNames: ['segment', 'outcome'],
  }),
  makeHistogramProvider({
    name: 'seller_kpi_query_latency_ms',
    help: 'KPI dashboard performance',
  }),
  makeCounterProvider({
    name: 'dispatch_proof_upload_total',
    help: 'Total dispatch proof uploads',
    labelNames: ['outcome'],
  }),
  makeCounterProvider({
    name: 'seller_scorecard_run_total',
    help: 'Cron execution count for seller scorecard',
  }),
  makeHistogramProvider({
    name: 'seller_scorecard_latency_ms',
    help: 'Time to compute all seller scores',
  }),
  makeGaugeProvider({
    name: 'seller_scorecard_dlq_size',
    help: 'Size of scorecard worker DLQ',
  }),
  makeCounterProvider({
    name: 'kpi_redis_bypass_total',
    help: 'Redis unavailable, DB fallback for KPIs',
    labelNames: ['segment'],
  }),
  makeCounterProvider({
    name: 'seller_context_guard_cache_miss_total',
    help: 'SellerContextGuard DB lookups',
  }),

  // Payment metrics
  makeCounterProvider({
    name: 'payment_initiated_total',
    help: 'Total payments initiated',
    labelNames: ['provider'],
  }),
  makeCounterProvider({
    name: 'payment_success_total',
    help: 'Total successful payments',
    labelNames: ['provider'],
  }),
  makeCounterProvider({
    name: 'payment_failed_total',
    help: 'Total failed payments',
    labelNames: ['provider', 'reason'],
  }),
  makeCounterProvider({
    name: 'payment_webhook_received_total',
    help: 'Total webhooks received',
    labelNames: ['event_type'],
  }),
  makeCounterProvider({
    name: 'payment_webhook_duplicate_total',
    help: 'Total duplicate webhooks skipped',
  }),
  makeCounterProvider({
    name: 'payment_webhook_invalid_signature_total',
    help: 'Total webhooks with invalid signature',
  }),
  makeCounterProvider({
    name: 'payment_webhook_queue_timeout_total',
    help: 'Total webhooks failed to enqueue',
  }),
  makeCounterProvider({
    name: 'payment_reconciliation_run_total',
    help: 'Total reconciliation runs',
  }),
  makeCounterProvider({
    name: 'payment_reconciliation_missed_total',
    help: 'Total missed reconciliations',
  }),
  makeHistogramProvider({
    name: 'payment_reconciliation_latency_ms',
    help: 'Latency of reconciliation job in ms',
  }),
  makeCounterProvider({
    name: 'payment_retry_redis_premature_eviction_total',
    help: 'Premature eviction of redis payment retry window',
  }),

  // Queue metrics
  makeGaugeProvider({
    name: 'bullmq_payment_queue_depth',
    help: 'Depth of payment queue',
  }),
  makeHistogramProvider({
    name: 'bullmq_payment_webhook_worker_latency_ms',
    help: 'Latency of webhook processing worker in ms',
  }),
  makeGaugeProvider({
    name: 'bullmq_payment_dlq_size',
    help: 'Size of payment DLQ',
  }),

  // Infrastructure metrics
  makeCounterProvider({
    name: 'redis_unavailable_total',
    help: 'Total redis unavailable occurrences',
    labelNames: ['component'],
  }),
  makeCounterProvider({
    name: 'rate_limit_atomic_failure_total',
    help: 'Total rate limit failures due to lua eval',
    labelNames: ['endpoint'],
  }),
  makeCounterProvider({
    name: 'webhook_double_consume_prevented_total',
    help: 'Total double consume races prevented in webhook',
  }),

  // Sprint 6: Notification Metrics (§23.1)
  makeCounterProvider({
    name: 'notification_sent_total',
    help: 'Total notifications sent',
    labelNames: ['channel', 'eventType', 'segment'],
  }),
  makeCounterProvider({
    name: 'notification_failed_total',
    help: 'Total notifications failed',
    labelNames: ['channel', 'reason', 'eventType'],
  }),
  makeCounterProvider({
    name: 'notification_dedup_skipped_total',
    help: 'Total notifications skipped due to dedup',
    labelNames: ['eventType'],
  }),
  makeCounterProvider({
    name: 'notification_outbox_consumed_total',
    help: 'Total outbox events consumed',
    labelNames: ['eventType'],
  }),
  makeCounterProvider({
    name: 'notification_outbox_failed_total',
    help: 'Total outbox events failed to process',
    labelNames: ['reason'],
  }),
  makeGaugeProvider({
    name: 'notification_queue_depth',
    help: 'Depth of the notifications queue (waiting jobs)',
  }),
  makeGaugeProvider({
    name: 'notification_dlq_size',
    help: 'Size of notifications-failed DLQ',
  }),
  makeGaugeProvider({
    name: 'notification_push_subscriptions_active',
    help: 'Total active push subscriptions across all users',
  }),
  makeHistogramProvider({
    name: 'notification_outbox_to_delivery_ms',
    help: 'Latency from outbox to delivery',
    buckets: [50, 100, 500, 1000, 2000, 5000],
  }),
  makeHistogramProvider({
    name: 'notification_template_render_ms',
    help: 'Template render latency per call',
    buckets: [1, 5, 10, 50, 100],
  }),
  // FIX-9: Circuit breaker state gauge — 0 = CLOSED (healthy), 1 = OPEN (blocking delivery)
  // Label {channel}: 'sms' | 'email'. Enables Grafana alert when either channel trips.
  makeGaugeProvider({
    name: 'notification_circuit_breaker_state',
    help: 'Circuit breaker state per channel: 1=OPEN, 0=CLOSED',
    labelNames: ['channel'],
  }),

  // ─── Sprint 7: Admin Action Metrics (§11.1) ──────────────────────────────────
  makeCounterProvider({
    name: 'admin_business_verified_total',
    help: 'Total businesses verified by admin',
    labelNames: ['segment'],
  }),
  makeCounterProvider({
    name: 'admin_business_rejected_total',
    help: 'Total businesses rejected by admin',
    labelNames: ['segment'],
  }),
  makeCounterProvider({
    name: 'admin_business_suspended_total',
    help: 'Total businesses suspended by admin',
    labelNames: ['segment', 'reason'],
  }),
  makeCounterProvider({
    name: 'admin_product_approved_total',
    help: 'Total products approved by admin',
    labelNames: ['segment', 'adminId'],
  }),
  makeCounterProvider({
    name: 'admin_product_rejected_total',
    help: 'Total products rejected by admin',
    labelNames: ['segment', 'adminId', 'reason'],
  }),
  makeCounterProvider({
    name: 'admin_user_suspended_total',
    help: 'Total users suspended by admin',
    labelNames: ['role'],
  }),
  makeCounterProvider({
    name: 'admin_payout_initiated_total',
    help: 'Total seller payouts initiated by admin',
    labelNames: [],
  }),
  makeCounterProvider({
    name: 'admin_payout_amount_initiated_inr',
    help: 'Cumulative INR total of initiated payouts',
    labelNames: [],
  }),
  makeGaugeProvider({
    name: 'exception_center_stuck_orders',
    help: 'Current count of stuck orders',
    labelNames: [],
  }),
  makeGaugeProvider({
    name: 'exception_center_failed_payments',
    help: 'Current count of failed payments',
    labelNames: [],
  }),
  makeCounterProvider({
    name: 'admin_audit_log_write_failures_total',
    help: 'Total AuditLog write failures',
    labelNames: [],
  }),
  makeHistogramProvider({
    name: 'admin_kyc_document_fetch_ms',
    help: 'Latency of KYC document fetch + signed URL generation',
    buckets: [10, 50, 100, 300, 500, 1000],
  }),
  makeHistogramProvider({
    name: 'admin_invoice_generation_ms',
    help: 'Tax invoice PDF generation latency',
    buckets: [200, 500, 1000, 2000, 5000, 10000],
  }),
  makeCounterProvider({
    name: 'feature_flag_toggle_total',
    help: 'Total feature flag toggles by admin',
    labelNames: ['name', 'env', 'segment'],
  }),
];
