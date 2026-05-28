-- AlterTable
ALTER TABLE "InventoryReservation" ADD COLUMN     "orderContext" TEXT,
ADD COLUMN     "reservationSource" TEXT DEFAULT 'WEB',
ADD COLUMN     "reservedByBusinessId" TEXT,
ADD COLUMN     "reservedByUserId" TEXT;

-- CreateTable
CREATE TABLE "segment_inventory_policies" (
    "id" TEXT NOT NULL,
    "segment" "Segment" NOT NULL,
    "maxReservationTtlSeconds" INTEGER NOT NULL DEFAULT 900,
    "maxReservationsPerUser" INTEGER NOT NULL DEFAULT 10,
    "maxReservationQtyPerRequest" INTEGER NOT NULL DEFAULT 1000,
    "reservationVelocityLimitPerHour" INTEGER NOT NULL DEFAULT 50,
    "allowBackorder" BOOLEAN NOT NULL DEFAULT false,
    "allowVirtualStock" BOOLEAN NOT NULL DEFAULT false,
    "lowStockThresholdPercent" INTEGER NOT NULL DEFAULT 20,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "segment_inventory_policies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "segment_inventory_policies_segment_key" ON "segment_inventory_policies"("segment");
