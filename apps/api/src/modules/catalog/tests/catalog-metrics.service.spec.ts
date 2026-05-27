import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { CatalogMetrics } from '../catalog-metrics.service';
import { Segment, ProductStatus, ApprovalPolicyType, MediaClass } from '@vyaparnet/database';

describe('CatalogMetrics', () => {
  let service: CatalogMetrics;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CatalogMetrics],
    }).compile();

    service = module.get<CatalogMetrics>(CatalogMetrics);
  });

  afterEach(() => {
    service.reset();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('Counters', () => {
    it('should increment simple metric without labels', () => {
      service.increment('test_counter');
      const counters = service.getAllCounters();
      expect(counters['test_counter']).toBe(1);
    });

    it('should increment metric with labels correctly formatting Prometheus key', () => {
      service.increment('test_counter', { env: 'production', role: 'admin' });
      const counters = service.getAllCounters();
      expect(counters['test_counter{env="production",role="admin"}']).toBe(1);
    });

    it('should support productCreated named helper', () => {
      service.productCreated(Segment.TEXTILE, ProductStatus.ACTIVE);
      const counters = service.getAllCounters();
      expect(counters['product_created_total{segment="TEXTILE",status="ACTIVE"}']).toBe(1);
    });

    it('should support productPublished named helper', () => {
      service.productPublished(Segment.SPARE_PARTS, ProductStatus.PENDING_APPROVAL);
      const counters = service.getAllCounters();
      expect(counters['product_published_total{segment="SPARE_PARTS",status="PENDING_APPROVAL"}']).toBe(1);
    });

    it('should support productUpdated named helper', () => {
      service.productUpdated(Segment.TEXTILE);
      const counters = service.getAllCounters();
      expect(counters['product_updated_total{segment="TEXTILE"}']).toBe(1);
    });

    it('should support productDeleted named helper', () => {
      service.productDeleted(Segment.SPARE_PARTS);
      const counters = service.getAllCounters();
      expect(counters['product_deleted_total{segment="SPARE_PARTS"}']).toBe(1);
    });

    it('should support searchQuery named helper', () => {
      service.searchQuery(Segment.TEXTILE, 'postgres');
      const counters = service.getAllCounters();
      expect(counters['search_query_total{segment="TEXTILE",engine="postgres"}']).toBe(1);
    });

    it('should support searchFallback named helper', () => {
      service.searchFallback(Segment.SPARE_PARTS);
      const counters = service.getAllCounters();
      expect(counters['search_fallback_total{segment="SPARE_PARTS"}']).toBe(1);
    });

    it('should support searchZeroResults named helper', () => {
      service.searchZeroResults(Segment.TEXTILE);
      const counters = service.getAllCounters();
      expect(counters['search_zero_results_total{segment="TEXTILE"}']).toBe(1);
    });

    it('should support searchCacheHit named helper', () => {
      service.searchCacheHit(Segment.TEXTILE, 'buyer');
      const counters = service.getAllCounters();
      expect(counters['search_cache_hit_total{segment="TEXTILE",scope="buyer"}']).toBe(1);
    });

    it('should support mediaUpload named helper', () => {
      service.mediaUpload('success', MediaClass.PRODUCT_IMAGE);
      const counters = service.getAllCounters();
      expect(counters['media_upload_total{status="success",mediaClass="PRODUCT_IMAGE"}']).toBe(1);
    });

    it('should support segmentAttrValidationFailure named helper', () => {
      service.segmentAttrValidationFailure(Segment.TEXTILE);
      const counters = service.getAllCounters();
      expect(counters['segment_attr_validation_failure_total{segment="TEXTILE"}']).toBe(1);
    });

    it('should support approvalPolicyType named helper', () => {
      service.approvalPolicyType(Segment.SPARE_PARTS, ApprovalPolicyType.AUTO_APPROVE);
      const counters = service.getAllCounters();
      expect(counters['approval_policy_type_total{segment="SPARE_PARTS",policyType="AUTO_APPROVE"}']).toBe(1);
    });
  });

  describe('Histograms', () => {
    it('should observe and record durations', () => {
      service.recordProductCreateDuration(142.5);
      service.recordMediaUploadDuration(580);
      service.recordSearchQueryDuration(Segment.TEXTILE, 45);

      const histograms = service.getAllHistograms();
      expect(histograms['product_create_duration_ms']).toEqual([142.5]);
      expect(histograms['media_upload_duration_ms']).toEqual([580]);
      expect(histograms['search_query_duration_ms{segment="TEXTILE"}']).toEqual([45]);
    });

    it('should warn when search query duration exceeds 150ms threshold', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      service.recordSearchQueryDuration(Segment.TEXTILE, 200);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[ALERT] search p95 > 150ms triggered!')
      );
      warnSpy.mockRestore();
    });
  });
});
