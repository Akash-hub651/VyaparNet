import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { MetricsService } from '../../observability/metrics.service';
import { Segment, KycStatus } from '@vyaparnet/database';
import { formatYearMonth } from '../../order/order-state-machine';

/**
 * SellerScorecardService — Phase 7
 *
 * Authority: SPRINT_5_EXECUTION_LOCK_FINAL.md §20
 *
 * Computes a composite seller score from 3 independently-sourced metrics:
 *   - Metric 1: Dispatch Speed    (40% weight) — % orders shipped within 48h of confirmedAt
 *   - Metric 2: Delivery Quality  (40% weight) — avg(deliverySpeed + productQuality) from SellerRating
 *   - Metric 3: Acceptance Rate   (20% weight) — % PLACED orders seller confirmed (not abandoned/cancelled)
 *
 * Anti-gaming: Uses OrderStatusHistory timestamps — NOT order.shippedAt (self-reported field).
 * INV-S5-28: Minimum 5 completed orders required for a meaningful score.
 * INV-S5-40: SUSPENDED businesses are NEVER scored.
 * INV-S5-17: SupplierScoreUpdated dedup key uses ISO hour (not Date.now()).
 * INV-S5-18: EventOutbox emitted ONLY if compositeScore changes >= 1 point.
 * INV-S5-23: schemaVersion '5.0' on all EventOutbox records.
 */
@Injectable()
export class SellerScorecardService {
  private readonly logger = new Logger(SellerScorecardService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: MetricsService,
  ) {}

  /**
   * Runs scorecard computation for ALL active (non-SUSPENDED) businesses.
   * Called by SellerScorecardWorker on a 6-hour cron.
   *
   * Per-business failures are isolated (try/catch per business) — one bad seller
   * cannot abort the entire run.
   */
  async runFullScorecardComputation(): Promise<void> {
    const startMs = Date.now();

    // INV-S5-40: MUST skip SUSPENDED businesses
    // Suspended sellers cannot ship — scoring them produces misleadingly low scores
    // and wastes compute that pollutes Sprint 7 Admin views.
    const businesses = await this.prisma.business.findMany({
      where: {
        isDeleted: false,
        kycStatus: { not: KycStatus.SUSPENDED },
      },
      select: { id: true, segment: true },
    });

    this.logger.log(
      { businessCount: businesses.length },
      'Scorecard computation started',
    );

    // FIX-9 (SC-2): Scale guard — current implementation loads all businesses in memory.
    // ACCEPTABLE: up to ~5K sellers (spec documented: SPRINT_5_EXECUTION_LOCK_FINAL.md §20 AI Footguns).
    // SPRINT 7 MIGRATION REQUIRED: When businesses.length > 5000, switch to cursor-based
    // chunking with 500 businesses per BullMQ child job (see SC-2 backlog item).
    if (businesses.length > 5000) {
      this.logger.error(
        { businessCount: businesses.length },
        'SCORECARD_SCALE_LIMIT_EXCEEDED: Business count exceeds 5K safe threshold. ' +
        'Migrate to chunked BullMQ child jobs (Sprint 7 SC-2 backlog). ' +
        'Continuing this run — but performance degradation expected.',
      );
    }


    for (const business of businesses) {
      try {
        await this.computeScoreForBusiness(business.id, business.segment);
      } catch (err) {
        // CRITICAL: per-business failure MUST NOT abort the entire cron run (AI Footgun §20)
        this.logger.error({
          event: 'SCORECARD_COMPUTE_FAILED',
          sellerId: business.id,
          error: (err as Error).message,
        });
        // Continue loop — remaining sellers still get scored
      }
    }

    // Observability: record cron duration histogram (§11.1)
    this.metrics.sellerScorecardLatencyMs.observe(Date.now() - startMs);
    this.metrics.sellerScorecardRunTotal.inc();

    this.logger.log(
      { businessCount: businesses.length, latencyMs: Date.now() - startMs },
      'Scorecard computation complete',
    );
  }

  /**
   * Computes and persists the scorecard for a single business.
   * 90-day rolling window. All queries scoped to businessId + segment (INV-S5-33).
   */
  async computeScoreForBusiness(
    businessId: string,
    segment: Segment,
  ): Promise<void> {
    const windowStart = new Date(Date.now() - 90 * 24 * 3600 * 1000); // 90-day window

    // ── Phase 1: Fetch minimal order data (INV: avoid full object load for 1K+ orders)
    // Two-phase fetch: IDs + status first, then targeted queries for metric data
    const orders = await this.prisma.order.findMany({
      where: {
        sellerId: businessId, // MANDATORY (INV-S5-14, INV-S5-33)
        segment,              // MANDATORY (INV-S5-33)
        createdAt: { gte: windowStart },
        isDeleted: false,
      },
      select: { id: true, status: true }, // MINIMAL select — never full objects
    });

    // ── Phase 2: Minimum sample size check (INV-S5-28)
    const completedOrders = orders.filter((o) =>
      ['SHIPPED', 'DELIVERED', 'COMPLETED'].includes(o.status),
    );

    if (completedOrders.length < 5) {
      // Upsert with 0 scores — stored so UI can show "Naya Seller" message
      // No EventOutbox — not enough data (INV-S5-18 implicit: score stays 0)
      await this.prisma.sellerScore.upsert({
        where: { businessId },
        create: {
          businessId,
          compositeScore: 0,
          dispatchSpeedScore: 0,
          deliveryQualityScore: 0,
          acceptanceRate: 0,
          orderCount: completedOrders.length,
          calculatedAt: new Date(),
          previousCompositeScore: null,
        },
        update: {
          orderCount: completedOrders.length,
          calculatedAt: new Date(),
        },
      });
      return; // No EventOutbox for ineligible sellers
    }

    const completedOrderIds = completedOrders.map((o) => o.id);

    // ─────────────────────────────────────────────────────────────────
    // METRIC 1: Dispatch Speed (40% weight)
    // % orders shipped within 48h of confirmedAt
    // Uses OrderStatusHistory — NOT order.shippedAt (anti-gaming: INV AI Footgun §20)
    // order.shippedAt is a self-reported field set by seller-controlled transitions;
    // OrderStatusHistory timestamps are SYSTEM-SET and immutable (INV-13: APPEND-ONLY)
    // ─────────────────────────────────────────────────────────────────
    const [shippedHistory, confirmedHistory] = await Promise.all([
      this.prisma.orderStatusHistory.findMany({
        where: {
          orderId: { in: completedOrderIds },
          statusTo: 'SHIPPED',
        },
        select: { orderId: true, timestamp: true },
      }),
      this.prisma.orderStatusHistory.findMany({
        where: {
          orderId: { in: completedOrderIds },
          statusTo: 'CONFIRMED',
        },
        select: { orderId: true, timestamp: true },
      }),
    ]);

    // Build lookup maps for O(n) join — avoid N+1
    const confirmedAtMap = new Map<string, Date>();
    for (const h of confirmedHistory) {
      // Keep earliest CONFIRMED record (idempotency guard — multiple confirms rare)
      const existing = confirmedAtMap.get(h.orderId);
      if (!existing || h.timestamp < existing) {
        confirmedAtMap.set(h.orderId, h.timestamp);
      }
    }
    const shippedAtMap = new Map<string, Date>();
    for (const h of shippedHistory) {
      // Keep earliest SHIPPED record
      const existing = shippedAtMap.get(h.orderId);
      if (!existing || h.timestamp < existing) {
        shippedAtMap.set(h.orderId, h.timestamp);
      }
    }

    const FORTY_EIGHT_HOURS_MS = 48 * 3600 * 1000;
    let ordersWithBothTimestamps = 0;
    let ordersShippedOnTime = 0;

    for (const orderId of completedOrderIds) {
      const confirmedAt = confirmedAtMap.get(orderId);
      const shippedAt = shippedAtMap.get(orderId);
      if (!confirmedAt || !shippedAt) continue; // Skip if missing history (data gap)
      ordersWithBothTimestamps++;
      const dispatchMs = shippedAt.getTime() - confirmedAt.getTime();
      if (dispatchMs <= FORTY_EIGHT_HOURS_MS) {
        ordersShippedOnTime++;
      }
    }

    // If no orders have both timestamps, default dispatch speed to 50 (neutral)
    const dispatchSpeedScore =
      ordersWithBothTimestamps > 0
        ? Math.round((ordersShippedOnTime / ordersWithBothTimestamps) * 100)
        : 50;

    // ─────────────────────────────────────────────────────────────────
    // METRIC 2: Delivery Quality (40% weight)
    // avg(deliverySpeed + productQuality) / 2 from SellerRating rows
    // Fallback (D6 decision): if ratings < 3, use dispatchSpeedScore alone
    //
    // NOTE: SellerRating.sellerId references Business.id in the ordering domain
    // but the SellerRating model itself has sellerId → User.id in the current schema.
    // We use the businessId via the ownerId join to get ratings for this business.
    // ─────────────────────────────────────────────────────────────────
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { ownerId: true },
    });

    let deliveryQualityScore: number;

    if (business) {
      const ratings = await this.prisma.sellerRating.findMany({
        where: {
          sellerId: business.ownerId, // SellerRating.sellerId → User.id (schema reality)
          createdAt: { gte: windowStart },
          isDeleted: false,
        },
        select: { deliverySpeed: true, productQuality: true },
      });

      if (ratings.length >= 3) {
        const totalQuality = ratings.reduce(
          (sum, r) =>
            sum + (r.deliverySpeed + r.productQuality) / 2,
          0,
        );
        // SellerRating scores are 1-5 scale; normalize to 0-100
        const avgQuality = totalQuality / ratings.length;
        deliveryQualityScore = Math.round(((avgQuality - 1) / 4) * 100);
      } else {
        // D6 fallback: insufficient ratings → use dispatch speed as proxy
        deliveryQualityScore = dispatchSpeedScore;
      }
    } else {
      deliveryQualityScore = dispatchSpeedScore;
    }

    // ─────────────────────────────────────────────────────────────────
    // METRIC 3: Acceptance Rate (20% weight)
    // % of PLACED orders that seller confirmed (not abandoned/cancelled by seller)
    // Using ALL orders in window (not just completedOrders) for accurate acceptance data
    // ─────────────────────────────────────────────────────────────────
    const allOrdersInWindow = orders; // already fetched above (all orders 90d window)
    const placedOrCancelledOrders = allOrdersInWindow.filter((o) =>
      [
        'PLACED', 'CONFIRMED', 'PROCESSING', 'SHIPPED',
        'DELIVERED', 'COMPLETED', 'CANCELLED',
      ].includes(o.status),
    );

    const confirmedOrFurtherOrders = placedOrCancelledOrders.filter((o) =>
      ['CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'COMPLETED'].includes(
        o.status,
      ),
    );

    const acceptanceRate =
      placedOrCancelledOrders.length > 0
        ? Math.round(
            (confirmedOrFurtherOrders.length / placedOrCancelledOrders.length) *
              100,
          )
        : 100; // Default 100% if no data (new seller)

    // ─────────────────────────────────────────────────────────────────
    // Composite score: weighted average, rounded to nearest integer
    // ─────────────────────────────────────────────────────────────────
    const compositeScore = Math.round(
      dispatchSpeedScore * 0.4 +
      deliveryQualityScore * 0.4 +
      acceptanceRate * 0.2,
    );

    // ── Get previous score for delta comparison and previousCompositeScore field
    const existing = await this.prisma.sellerScore.findUnique({
      where: { businessId },
      select: { compositeScore: true },
    });

    // ── Upsert — idempotent, safe to re-run
    await this.prisma.sellerScore.upsert({
      where: { businessId },
      create: {
        businessId,
        compositeScore,
        dispatchSpeedScore,
        deliveryQualityScore,
        acceptanceRate,
        orderCount: completedOrders.length,
        calculatedAt: new Date(),
        previousCompositeScore: null,
      },
      update: {
        previousCompositeScore: existing?.compositeScore ?? null,
        compositeScore,
        dispatchSpeedScore,
        deliveryQualityScore,
        acceptanceRate,
        orderCount: completedOrders.length,
        calculatedAt: new Date(),
      },
    });

    // ── EventOutbox: emit ONLY if score changed >= 1 point (INV-S5-18)
    // Also emit on first calculation (existing === null)
    const scoreDelta = Math.abs(
      compositeScore - (existing?.compositeScore ?? 0),
    );

    if (scoreDelta >= 1 || existing === null) {
      // INV-S5-17: dedup key MUST use ISO hour — NOT Date.now() or randomUUID()
      // "2026-05-29T14" — deterministic; same run within same hour won't duplicate
      const hour = new Date().toISOString().slice(0, 13);

      await this.prisma.eventOutbox.create({
        data: {
          eventType: 'SupplierScoreUpdated',
          eventVersion: '1.0',         // INV-20: eventVersion required
          schemaVersion: '5.0',         // INV-S5-23: Sprint 5 schema version
          deduplicationKey: `supplier-score-updated-${businessId}-${hour}`, // INV-S5-17
          payload: {
            businessId,
            segment,
            compositeScore,
            dispatchSpeedScore,
            deliveryQualityScore,
            acceptanceRate,
            previousCompositeScore: existing?.compositeScore ?? null,
            calculatedAt: new Date().toISOString(),
            orderCount: completedOrders.length,
          },
          eventMonth: formatYearMonth(new Date()),
          status: 'PENDING',
        },
      });
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // Public read API — called by SellerDashboardController GET /scorecard
  // ─────────────────────────────────────────────────────────────────

  /**
   * Returns the pre-computed SellerScore shaped as SellerScoreResponseDto.
   * If no score exists or orderCount < 5, returns eligible: false with "Naya Seller" narrative.
   */
  async getScorecard(businessId: string): Promise<{
    eligible: boolean;
    compositeScore: number;
    dispatchSpeedScore: number;
    deliveryQualityScore: number;
    acceptanceRate: number;
    orderCount: number;
    calculatedAt: string | null;
    narrative: { dispatch: string; delivery: string; overall: string };
    previousCompositeScore: number | null;
    scoreTrend: 'UP' | 'DOWN' | 'STABLE' | null;
  }> {
    const score = await this.prisma.sellerScore.findUnique({
      where: { businessId },
    });

    // No score yet, or insufficient orders (INV-S5-28)
    if (!score || score.orderCount < 5) {
      return {
        eligible: false,
        compositeScore: 0,
        dispatchSpeedScore: 0,
        deliveryQualityScore: 0,
        acceptanceRate: 0,
        orderCount: score?.orderCount ?? 0,
        calculatedAt: score?.calculatedAt.toISOString() ?? null,
        narrative: {
          dispatch:
            'Naya Seller — abhi tak 5 orders complete nahi hue. Score tab milega jab aap 5 orders ship karoge.',
          delivery: 'Delivery rating ke liye 5 orders puri karein.',
          overall:
            'Naya Seller — thodi aur orders complete karein aur aapka scorecard yahan dikhega!',
        },
        previousCompositeScore: null,
        scoreTrend: null,
      };
    }

    const narrative = this.buildNarrative(
      score.dispatchSpeedScore,
      score.deliveryQualityScore,
      score.compositeScore,
    );

    // Score trend (null on first calculation — no previous score to compare)
    let scoreTrend: 'UP' | 'DOWN' | 'STABLE' | null = null;
    if (score.previousCompositeScore !== null) {
      const delta = score.compositeScore - score.previousCompositeScore;
      if (delta >= 1) scoreTrend = 'UP';
      else if (delta <= -1) scoreTrend = 'DOWN';
      else scoreTrend = 'STABLE';
    }

    return {
      eligible: true,
      compositeScore: score.compositeScore,
      dispatchSpeedScore: score.dispatchSpeedScore,
      deliveryQualityScore: score.deliveryQualityScore,
      acceptanceRate: score.acceptanceRate,
      orderCount: score.orderCount,
      calculatedAt: score.calculatedAt.toISOString(),
      narrative,
      previousCompositeScore: score.previousCompositeScore,
      scoreTrend,
    };
  }

  /**
   * Builds Hinglish narratives based on score band:
   * 0-40 = Kam | 41-70 = Theek Hai | 71-100 = Badiya
   */
  private buildNarrative(
    dispatchScore: number,
    deliveryScore: number,
    compositeScore: number,
  ): { dispatch: string; delivery: string; overall: string } {
    const dispatch =
      dispatchScore >= 71
        ? 'Aap orders bahut tez ship karte ho — buyers khush hain!'
        : dispatchScore >= 41
          ? 'Dispatch speed theek hai, lekin 48 ghante mein ship karne ki koshish karein.'
          : 'Dispatch mein thodi der ho rahi hai — orders jaldi ship karein.';

    const delivery =
      deliveryScore >= 71
        ? 'Delivery quality bahut acchi hai — great job!'
        : deliveryScore >= 41
          ? 'Delivery quality average hai — packaging aur quality improve karein.'
          : 'Delivery quality mein sudhaar ki zaroorat hai.';

    const overall =
      compositeScore >= 71
        ? `Badiya! Aapka score ${compositeScore}/100 hai — aap ek top seller hain!`
        : compositeScore >= 41
          ? `Theek hai. Aapka score ${compositeScore}/100 hai — thodi mehnat aur karein.`
          : `Aapka score ${compositeScore}/100 hai — dispatch speed aur delivery improve karein.`;

    return { dispatch, delivery, overall };
  }
}
