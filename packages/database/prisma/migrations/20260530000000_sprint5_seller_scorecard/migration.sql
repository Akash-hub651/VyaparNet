-- Sprint 5 Migration: Seller Scorecard Engine
-- Authority: SPRINT_5_EXECUTION_LOCK_FINAL.md §14

-- ────────────────────────────────────────────────
-- 1. Add SUSPENDED value to KycStatus enum
-- ────────────────────────────────────────────────
ALTER TYPE "KycStatus" ADD VALUE IF NOT EXISTS 'SUSPENDED';

-- ────────────────────────────────────────────────
-- 2. Add dispatchProofUrl and dispatchProofAt to OrderTracking
-- ────────────────────────────────────────────────
ALTER TABLE "OrderTracking"
  ADD COLUMN IF NOT EXISTS "dispatchProofUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "dispatchProofAt"  TIMESTAMPTZ;

-- ────────────────────────────────────────────────
-- 3. Create SellerScore table (INV-S5-16: NOT JSONB on Business)
-- ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "SellerScore" (
  "id"                     TEXT NOT NULL,
  "businessId"             TEXT NOT NULL,
  "compositeScore"         INTEGER NOT NULL DEFAULT 0,
  "dispatchSpeedScore"     INTEGER NOT NULL DEFAULT 0,
  "deliveryQualityScore"   INTEGER NOT NULL DEFAULT 0,
  "acceptanceRate"         INTEGER NOT NULL DEFAULT 0,
  "orderCount"             INTEGER NOT NULL DEFAULT 0,
  "calculatedAt"           TIMESTAMPTZ NOT NULL,
  "previousCompositeScore" INTEGER,

  CONSTRAINT "SellerScore_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SellerScore_businessId_key" UNIQUE ("businessId"),
  CONSTRAINT "SellerScore_businessId_fkey"
    FOREIGN KEY ("businessId") REFERENCES "Business"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

-- ────────────────────────────────────────────────
-- 4. Indexes for SellerScore (per §14 spec)
-- ────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "idx_seller_score_biz"
  ON "SellerScore"("businessId");

CREATE INDEX IF NOT EXISTS "idx_seller_score_composite"
  ON "SellerScore"("compositeScore");

-- ────────────────────────────────────────────────
-- 5. idx_order_seller_date for KPI ordersToday query (Phase 6 fix)
-- ────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "idx_order_seller_date"
  ON "Order"("sellerId", "createdAt");
