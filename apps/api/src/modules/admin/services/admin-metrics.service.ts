import { Injectable } from '@nestjs/common';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { Counter, Histogram, Gauge } from 'prom-client';

/**
 * AdminMetricsService — Prometheus instrumentation for Sprint 7 admin actions.
 *
 * All counters and histograms are registered in ObservabilityModule (global).
 * AdminModule declares this as a provider — it receives injected metrics
 * via @InjectMetric decorators.
 *
 * Authority: §11.1 (Observability Architecture), Sprint 7.
 */
@Injectable()
export class AdminMetricsService {
  constructor(
    @InjectMetric('admin_business_verified_total')
    public readonly businessVerifiedTotal: Counter<string>,

    @InjectMetric('admin_business_rejected_total')
    public readonly businessRejectedTotal: Counter<string>,

    @InjectMetric('admin_business_suspended_total')
    public readonly businessSuspendedTotal: Counter<string>,

    @InjectMetric('admin_product_approved_total')
    public readonly productApprovedTotal: Counter<string>,

    @InjectMetric('admin_product_rejected_total')
    public readonly productRejectedTotal: Counter<string>,

    @InjectMetric('admin_user_suspended_total')
    public readonly userSuspendedTotal: Counter<string>,

    @InjectMetric('admin_payout_initiated_total')
    public readonly payoutInitiatedTotal: Counter<string>,

    @InjectMetric('admin_payout_amount_initiated_inr')
    public readonly payoutAmountInitiatedInr: Counter<string>,

    @InjectMetric('exception_center_stuck_orders')
    public readonly exceptionCenterStuckOrders: Gauge<string>,

    @InjectMetric('exception_center_failed_payments')
    public readonly exceptionCenterFailedPayments: Gauge<string>,

    @InjectMetric('admin_audit_log_write_failures_total')
    public readonly auditLogWriteFailuresTotal: Counter<string>,

    @InjectMetric('admin_kyc_document_fetch_ms')
    public readonly kycDocumentFetchMs: Histogram<string>,

    @InjectMetric('admin_invoice_generation_ms')
    public readonly invoiceGenerationMs: Histogram<string>,

    @InjectMetric('feature_flag_toggle_total')
    public readonly featureFlagToggleTotal: Counter<string>,
  ) {}
}
