-- Sprint 7 Phase 1 Migration: sprint7_schema
-- INV-S7-32: NotificationDeliveryStatus enum + Notification.status field
-- §3.3: Performance indexes for Sprint 7 admin queries (H-P1-1: ALL in single migration)
-- AUDIT-P1-B: SupportTicket.resolvedNote field

-- ============================================================
-- Step 1: Create NotificationDeliveryStatus enum (INV-S7-32)
-- ============================================================
CREATE TYPE "NotificationDeliveryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- ============================================================
-- Step 2: Add status field to Notification model (INV-S7-32)
-- ============================================================
ALTER TABLE "Notification"
  ADD COLUMN "status" "NotificationDeliveryStatus" NOT NULL DEFAULT 'PENDING';

-- ============================================================
-- Step 3: Add SupportTicket.resolvedNote (AUDIT-P1-B)
-- ============================================================
ALTER TABLE "SupportTicket"
  ADD COLUMN "resolvedNote" TEXT;

-- ============================================================
-- Step 4: §3.3 Performance Indexes (H-P1-1: ALL required, not optional)
-- ============================================================

-- Order: stuck-orders exception center query (CRITICAL — full table scan without this)
CREATE INDEX "idx_order_status_updated" ON "Order"("status", "updatedAt");

-- Payment: failed payments exception query
CREATE INDEX "idx_payment_status_order" ON "Payment"("status", "orderId");

-- FeatureFlag: flag cache lookups by name+env+segment (INV-S7-18)
CREATE INDEX "idx_ff_name_env_seg" ON "FeatureFlag"("name", "env", "segment");

-- SellerPayout: admin payout list
CREATE INDEX "idx_payout_status_seller" ON "SellerPayout"("status", "sellerId");

-- SupportTicket: admin ticket queue (status+priority+date)
CREATE INDEX "idx_st_stat_pri_date" ON "SupportTicket"("status", "priority", "createdAt");

-- Notification: admin user-notification audit query (INV-S7-31)
CREATE INDEX "idx_notif_user_status" ON "Notification"("userId", "status");
