-- CreateEnum
CREATE TYPE "RfqStatus" AS ENUM ('OPEN', 'CLOSED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "QuotationStatus" ADD VALUE 'CANCELLED';

-- AlterTable
ALTER TABLE "BuyerLedger" ADD COLUMN     "returnRequestId" TEXT;

-- AlterTable
ALTER TABLE "EventOutbox" ALTER COLUMN "schemaVersion" SET DEFAULT '8.0';

-- AlterTable
ALTER TABLE "Quotation" ADD COLUMN     "rfqId" TEXT;

-- AlterTable
ALTER TABLE "SellerScore" ADD COLUMN     "disputeRate" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "returnRate" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "Rfq" (
    "id" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "segment" "Segment" NOT NULL,
    "status" "RfqStatus" NOT NULL DEFAULT 'OPEN',
    "items" JSONB NOT NULL,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Rfq_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_rfq_buyer_stat" ON "Rfq"("buyerId", "status");

-- CreateIndex
CREATE INDEX "idx_rfq_seg_stat" ON "Rfq"("segment", "status");

-- CreateIndex
CREATE INDEX "idx_inv_biz" ON "Inventory"("businessId");

-- CreateIndex
CREATE INDEX "idx_invres_user" ON "InventoryReservation"("reservedByUserId");

-- CreateIndex
CREATE INDEX "idx_invres_biz" ON "InventoryReservation"("reservedByBusinessId");

-- AddForeignKey
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "Rfq"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rfq" ADD CONSTRAINT "Rfq_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
