import { Injectable } from '@nestjs/common';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { Counter, Gauge, Histogram } from 'prom-client';

/**
 * NotificationMetricsService — Prometheus metrics for the notification platform.
 *
 * Phase 12: Full Prometheus metric implementations (Observability & Operations).
 * FIX-9/FIX-10: Added notification_circuit_breaker_state{channel} gauge.
 *
 * Metrics defined in §9.1:
 *   notification_sent_total{channel, eventType, segment}     — Counter
 *   notification_failed_total{channel, reason, eventType}   — Counter
 *   notification_dedup_skipped_total{eventType}              — Counter
 *   notification_outbox_consumed_total{eventType}            — Counter
 *   notification_outbox_failed_total{reason}                 — Counter
 *   notification_queue_depth                                  — Gauge  (FIX-5: observed in OutboxConsumerWorker)
 *   notification_dlq_size                                     — Gauge
 *   notification_push_subscriptions_active                   — Gauge  (FIX-7: observed in OutboxConsumerWorker)
 *   notification_outbox_to_delivery_ms                       — Histogram
 *   notification_template_render_ms                          — Histogram  (FIX-6: observed in TemplateService)
 *   notification_circuit_breaker_state{channel}              — Gauge  (FIX-9/FIX-10: 0=CLOSED, 1=OPEN)
 */
@Injectable()
export class NotificationMetricsService {
  constructor(
    @InjectMetric('notification_sent_total')
    public readonly notificationSentTotal: Counter<string>,
    @InjectMetric('notification_failed_total')
    public readonly notificationFailedTotal: Counter<string>,
    @InjectMetric('notification_dedup_skipped_total')
    public readonly notificationDedupSkippedTotal: Counter<string>,
    @InjectMetric('notification_outbox_consumed_total')
    public readonly notificationOutboxConsumedTotal: Counter<string>,
    @InjectMetric('notification_outbox_failed_total')
    public readonly notificationOutboxFailedTotal: Counter<string>,
    @InjectMetric('notification_queue_depth')
    public readonly notificationQueueDepth: Gauge<string>,
    @InjectMetric('notification_dlq_size')
    public readonly notificationDlqSize: Gauge<string>,
    @InjectMetric('notification_push_subscriptions_active')
    public readonly notificationPushSubscriptionsActive: Gauge<string>,
    @InjectMetric('notification_outbox_to_delivery_ms')
    public readonly notificationOutboxToDeliveryMs: Histogram<string>,
    @InjectMetric('notification_template_render_ms')
    public readonly notificationTemplateRenderMs: Histogram<string>,
    // FIX-9/FIX-10: Circuit breaker state — 0 = CLOSED (healthy), 1 = OPEN (blocking delivery)
    // Set by CircuitBreakerService on every open/close transition for real-time Grafana visibility.
    @InjectMetric('notification_circuit_breaker_state')
    public readonly notificationCbState: Gauge<string>,
  ) {}
}
