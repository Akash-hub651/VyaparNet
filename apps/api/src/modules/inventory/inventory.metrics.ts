import { Injectable } from '@nestjs/common';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { Counter, Gauge, Histogram } from 'prom-client';

/**
 * InventoryMetrics — Observability counters and histograms for inventory operations.
 *
 * Phase 8: Full Prometheus metric registration per §25.1.
 * ALL 15 required metrics are declared here via @willsoto/nestjs-prometheus.
 *
 * Authority: SPRINT3_EXECUTION_LOCK_FINAL.md §25.1
 */
@Injectable()
export class InventoryMetrics {
  constructor(
    // §25.1 Counters
    @InjectMetric('inventory_reservation_success_total')
    public readonly resSuccessTotal: Counter<string>,
    
    @InjectMetric('inventory_reservation_failure_total')
    public readonly resFailureTotal: Counter<string>,
    
    @InjectMetric('inventory_idempotency_hit_total')
    public readonly idempotencyHitTotal: Counter<string>,
    
    @InjectMetric('inventory_optimistic_lock_retry_total')
    public readonly lockRetryTotal: Counter<string>,
    
    @InjectMetric('inventory_oversell_prevented_total')
    public readonly oversellPreventedTotal: Counter<string>,
    
    @InjectMetric('inventory_reservation_released_total')
    public readonly releasedTotal: Counter<string>,
    
    @InjectMetric('inventory_expiry_processed_total')
    public readonly expiryTotal: Counter<string>,
    
    @InjectMetric('inventory_drift_detected')
    public readonly driftDetectedTotal: Counter<string>,
    
    @InjectMetric('inventory_abuse_violation_total')
    public readonly abuseViolationTotal: Counter<string>,
    
    @InjectMetric('inventory_protection_mode_changes')
    public readonly protectModeChangesTotal: Counter<string>,
    
    @InjectMetric('inventory_hot_product_detected')
    public readonly hotProductDetectedTotal: Counter<string>,

    // §25.1 Histograms
    @InjectMetric('inventory_reservation_latency_ms')
    public readonly latencyHistogram: Histogram<string>,

    // §25.1 Gauges
    @InjectMetric('inventory_active_reservations')
    public readonly activeReservationsGauge: Gauge<string>,
    
    @InjectMetric('inventory_low_stock_products')
    public readonly lowStockProductsGauge: Gauge<string>,
  ) {}

  reservationSuccess(segment: string): void {
    this.resSuccessTotal.labels(segment).inc();
  }

  reservationFailure(reason: string, segment: string): void {
    this.resFailureTotal.labels(reason, segment).inc();
  }

  idempotencyHit(): void {
    this.idempotencyHitTotal.inc();
  }

  optimisticLockRetry(attempt: number): void {
    this.lockRetryTotal.labels(attempt.toString()).inc();
  }

  oversellPrevented(): void {
    this.oversellPreventedTotal.inc();
  }

  reservationReleased(reason: string): void {
    this.releasedTotal.labels(reason).inc();
  }

  expiryProcessed(): void {
    this.expiryTotal.inc();
  }

  driftDetected(_inventoryId: string, isCritical: boolean): void {
    this.driftDetectedTotal.labels(isCritical.toString()).inc();
  }

  abuseViolation(type: string, segment: string): void {
    this.abuseViolationTotal.labels(type, segment).inc();
  }

  protectionModeChanged(mode: string): void {
    this.protectModeChangesTotal.labels(mode).inc();
  }

  /**
   * Hot product detection: called when contention threshold exceeded.
   * §11.1, §19.1
   */
  hotProductDetected(inventoryId: string, contentionCount: number): void {
    this.hotProductDetectedTotal.labels(inventoryId).inc(contentionCount);
  }

  recordReservationLatency(ms: number): void {
    this.latencyHistogram.observe(ms);
  }

  setActiveReservations(count: number): void {
    this.activeReservationsGauge.set(count);
  }

  setLowStockProducts(count: number): void {
    this.lowStockProductsGauge.set(count);
  }
}
