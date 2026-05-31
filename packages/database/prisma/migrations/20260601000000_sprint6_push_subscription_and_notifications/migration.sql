-- =============================================================================
-- Sprint 6 Migration: PushSubscription table + Notification system activation
-- Authority: SPRINT_6_EXECUTION_LOCK_FINAL.md §3.2
-- Decision: D2.7a — Multi-device push support requires separate PushSubscription table
-- =============================================================================

-- CreateTable: PushSubscription
-- INV-S6-9: One row per (userId, endpoint) unique pair
-- INV-S6-22: Capped at 10 per user (enforced at repository layer)
-- INV-S6-9: On 410 Gone → deleteByEndpoint() called immediately
CREATE TABLE "PushSubscription" (
    "id"        TEXT        NOT NULL,
    "userId"    TEXT        NOT NULL,
    "endpoint"  TEXT        NOT NULL,
    "p256dh"    TEXT        NOT NULL,
    "auth"      TEXT        NOT NULL,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isActive"  BOOLEAN     NOT NULL DEFAULT true,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: active subscriptions per user (for fast push fan-out)
CREATE INDEX "idx_push_sub_user_active" ON "PushSubscription"("userId", "isActive");

-- CreateUniqueIndex: one row per (userId, endpoint) — enforces INV-S6-9
CREATE UNIQUE INDEX "uq_push_sub_user_endpoint" ON "PushSubscription"("userId", "endpoint");

-- AddForeignKey: PushSubscription.userId → User.id
ALTER TABLE "PushSubscription"
    ADD CONSTRAINT "PushSubscription_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- Verify: Notification table should already exist from v4.3
-- Verify: NotificationTemplate table should already exist from v4.3
-- Verify: idx_notif_user_read_date index should already exist from v4.3
-- (No-op if already exist — migration is additive only)

-- §19.2 Phase 8: Add notificationPreferences JSONB to User table
-- NULL means: use DEFAULT_NOTIFICATION_PREFERENCES in application code
-- Do NOT set a DB default — application code applies the default via NotificationPreferenceSchema.safeParse()
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "notificationPreferences" JSONB;
