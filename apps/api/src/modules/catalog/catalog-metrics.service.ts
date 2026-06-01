import { Injectable } from '@nestjs/common';
import {
  Segment,
  ProductStatus,
  ApprovalPolicyType,
  MediaClass,
} from '@vyaparnet/database';

/**
 * CatalogMetrics — Prometheus-compatible metrics register for catalog events.
 *
 * In Sprint 2: implemented as in-memory counters/histograms for simple tracking.
 * Sprint 9 (Hardening): will be replaced with @willsoto/nestjs-prometheus.
 *
 * Authority: VyaparNet_Deployment_Runtime_Architecture_v1.md Section 12
 */
@Injectable()
export class CatalogMetrics {
  private readonly counters: Map<string, number> = new Map();
  private readonly histograms: Map<string, number[]> = new Map();

  increment(metric: string, labels?: Record<string, string>): void {
    const key = this.formatKey(metric, labels);
    this.counters.set(key, (this.counters.get(key) ?? 0) + 1);
  }

  observe(
    metric: string,
    value: number,
    labels?: Record<string, string>,
  ): void {
    const key = this.formatKey(metric, labels);
    if (!this.histograms.has(key)) {
      this.histograms.set(key, []);
    }
    this.histograms.get(key)!.push(value);
    this.evaluateAlertRules(metric, value, labels);
  }

  private evaluateAlertRules(
    metric: string,
    value: number,
    labels?: Record<string, string>,
  ): void {
    // Alert threshold checks (Simulating Prometheus Alertmanager rules locally)
    if (metric === 'search_query_duration_ms' && value > 150) {
      console.warn(
        `[ALERT] search p95 > 150ms triggered! Latency check: ${value}ms for segment: ${labels?.segment}`,
      );
    }
  }

  private formatKey(metric: string, labels?: Record<string, string>): string {
    return labels
      ? `${metric}{${Object.entries(labels)
          .map(([k, v]) => `${k}="${v}"`)
          .join(',')}}`
      : metric;
  }

  getAllCounters(): Record<string, number> {
    return Object.fromEntries(this.counters);
  }

  getAllHistograms(): Record<string, number[]> {
    return Object.fromEntries(this.histograms);
  }

  reset(): void {
    this.counters.clear();
    this.histograms.clear();
  }

  // ─── Named helper methods for strict type-safe emission ─────

  productCreated(segment: Segment, status: ProductStatus): void {
    this.increment('product_created_total', { segment, status });
  }

  productPublished(segment: Segment, status: ProductStatus): void {
    this.increment('product_published_total', { segment, status });
  }

  productUpdated(segment: Segment): void {
    this.increment('product_updated_total', { segment });
  }

  productDeleted(segment: Segment): void {
    this.increment('product_deleted_total', { segment });
  }

  searchQuery(segment: Segment, engine: 'postgres' | 'opensearch'): void {
    this.increment('search_query_total', { segment, engine });
  }

  searchFallback(segment: Segment): void {
    this.increment('search_fallback_total', { segment });
  }

  searchZeroResults(segment: Segment): void {
    this.increment('search_zero_results_total', { segment });
  }

  searchCacheHit(segment: Segment, scope: string): void {
    this.increment('search_cache_hit_total', { segment, scope });
  }

  mediaUpload(status: 'success' | 'failure', mediaClass: MediaClass): void {
    this.increment('media_upload_total', { status, mediaClass });
  }

  mediaProcessing(status: 'success' | 'failure'): void {
    this.increment('media_processing_total', { status });
  }

  segmentAttrValidationFailure(segment: Segment): void {
    this.increment('segment_attr_validation_failure_total', { segment });
  }

  approvalPolicyType(segment: Segment, policyType: ApprovalPolicyType): void {
    this.increment('approval_policy_type_total', { segment, policyType });
  }

  recordSearchQueryDuration(segment: Segment, durationMs: number): void {
    this.observe('search_query_duration_ms', durationMs, { segment });
  }

  recordProductCreateDuration(durationMs: number): void {
    this.observe('product_create_duration_ms', durationMs);
  }

  recordMediaUploadDuration(durationMs: number): void {
    this.observe('media_upload_duration_ms', durationMs);
  }
}
