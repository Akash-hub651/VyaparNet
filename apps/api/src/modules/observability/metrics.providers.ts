import { makeCounterProvider, makeGaugeProvider, makeHistogramProvider } from '@willsoto/nestjs-prometheus';

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
];
