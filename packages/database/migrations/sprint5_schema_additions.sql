-- MIGRATION S5-1: SellerScore table (INV-S5-16)
CREATE TABLE "SellerScore" (
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
  CONSTRAINT "SellerScore_businessId_key" UNIQUE ("businessId")
);
CREATE INDEX "idx_seller_score_biz" ON "SellerScore" ("businessId");
CREATE INDEX "idx_seller_score_composite" ON "SellerScore" ("compositeScore");

-- MIGRATION S5-2: OrderTracking — add dispatch proof fields
ALTER TABLE "OrderTracking" ADD COLUMN "dispatchProofUrl"  TEXT;
ALTER TABLE "OrderTracking" ADD COLUMN "dispatchProofAt"   TIMESTAMPTZ;

-- MIGRATION S5-3: Required index for KPI queries (INV-S5-14)
CREATE INDEX "idx_order_seller_date" ON "Order" ("sellerId", "createdAt");
