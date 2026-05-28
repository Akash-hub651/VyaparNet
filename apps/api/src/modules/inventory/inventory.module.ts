import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import {
  PrometheusModule,
  makeCounterProvider,
  makeHistogramProvider,
  makeGaugeProvider,
} from '@willsoto/nestjs-prometheus';

// Repositories (Phase 1 stubs → Phase 2 full implementations)
import { InventoryRepository } from './repositories/inventory.repository';
import { ReservationRepository } from './repositories/reservation.repository';
import { MovementRepository } from './repositories/movement.repository';
import { SnapshotRepository } from './repositories/snapshot.repository';
import { SegmentInventoryPolicyRepository } from './repositories/segment-inventory-policy.repository';

// Services — Phase 2
import { InventoryMetrics } from './inventory.metrics';
import { InventoryLockService } from './inventory-lock.service';
import { InventoryPolicyService } from './inventory-policy.service';
import { InventoryProtectionModeService } from './inventory-protection-mode.service';
import { InventoryAbuseGuard } from './inventory-abuse-guard.service';

// Services — Phase 3
import { InventoryReserveService } from './inventory-reserve.service';
import { InventoryReleaseService } from './inventory-release.service';
import { InventoryUpdateService } from './inventory-update.service';
import { InventoryQueryService } from './inventory-query.service';
import { InventoryReconcileService } from './inventory-reconcile.service';

// Services — Phase 4
import { InventoryService } from './inventory.service';
import { InventoryController } from './inventory.controller';

// Workers — Phase 5
import { InventoryCronService } from './inventory-cron.service';
import { InventoryProcessor } from './inventory.processor';

// Event Consumers — Phase 6
import { InventoryEventConsumer } from './inventory-event.consumer';

/**
 * InventoryModule — Phase 3 wiring.
 *
 * Authority: SPRINT3_EXECUTION_LOCK_FINAL.md §10.2
 *
 * MODULE BOUNDARY RULES (§10.2):
 *  - exports: [] for Phase 3 — InventoryService facade added in Phase 4.
 *  - Repositories are NEVER exported — only InventoryService is exported (Phase 4).
 *  - RedisService and PrismaService injected via @Global() modules — no explicit import needed.
 *
 * Phase 2 added: InventoryMetrics, InventoryLockService, InventoryPolicyService,
 *                InventoryProtectionModeService, InventoryAbuseGuard.
 * Phase 3 adds:  InventoryReserveService, InventoryReleaseService, InventoryUpdateService,
 *                InventoryQueryService, InventoryReconcileService.
 * Phase 4 adds:  InventoryService (facade), InventoryController — exports [InventoryService].
 */
@Module({
  imports: [
    // Phase 8: Metrics
    PrometheusModule.register(),
    // Phase 5: BullMQ Queue Registration
    BullModule.registerQueue({ name: 'inventory' }),
  ],
  controllers: [InventoryController],
  providers: [
    // Phase 8: Metrics providers
    makeCounterProvider({ name: 'inventory_reservation_success_total', help: 'Successful reservations', labelNames: ['segment'] }),
    makeCounterProvider({ name: 'inventory_reservation_failure_total', help: 'Failed reservations', labelNames: ['reason', 'segment'] }),
    makeCounterProvider({ name: 'inventory_idempotency_hit_total', help: 'Idempotency hits' }),
    makeCounterProvider({ name: 'inventory_optimistic_lock_retry_total', help: 'Optimistic lock retries', labelNames: ['attempt'] }),
    makeCounterProvider({ name: 'inventory_oversell_prevented_total', help: 'Oversells prevented' }),
    makeCounterProvider({ name: 'inventory_reservation_released_total', help: 'Reservations released', labelNames: ['reason'] }),
    makeCounterProvider({ name: 'inventory_expiry_processed_total', help: 'Expiries processed' }),
    makeCounterProvider({ name: 'inventory_drift_detected', help: 'Drift detected', labelNames: ['isCritical'] }),
    makeCounterProvider({ name: 'inventory_abuse_violation_total', help: 'Abuse violations', labelNames: ['type', 'segment'] }),
    makeCounterProvider({ name: 'inventory_protection_mode_changes', help: 'Protection mode changes', labelNames: ['mode'] }),
    makeCounterProvider({ name: 'inventory_hot_product_detected', help: 'Hot product detected', labelNames: ['inventoryId'] }),
    makeHistogramProvider({ name: 'inventory_reservation_latency_ms', help: 'Reservation latency in ms' }),
    makeGaugeProvider({ name: 'inventory_active_reservations', help: 'Active reservations' }),
    makeGaugeProvider({ name: 'inventory_low_stock_products', help: 'Low stock products' }),

    // Phase 2: Observability
    InventoryMetrics,

    // Phase 2: Foundation Services
    InventoryLockService,
    InventoryPolicyService,
    InventoryProtectionModeService,
    InventoryAbuseGuard,

    // Phase 3: Reserve & Release Services
    InventoryReserveService,
    InventoryReleaseService,
    InventoryUpdateService,
    InventoryQueryService,
    InventoryReconcileService,

    // Repositories (Phase 2E — fully implemented)
    InventoryRepository,
    ReservationRepository,
    MovementRepository,
    SnapshotRepository,
    SegmentInventoryPolicyRepository,

    // Phase 4: Facade
    InventoryService,

    // Phase 5: Workers & Cron
    InventoryCronService,
    InventoryProcessor,

    // Phase 6: Event Consumers
    InventoryEventConsumer,
  ],
  exports: [
    // Phase 4: exports [InventoryService] ONLY
    // Repositories are NEVER exported (§10.2)
    InventoryService,
  ],
})
export class InventoryModule {}
