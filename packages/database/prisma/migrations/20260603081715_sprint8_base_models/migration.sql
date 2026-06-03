/*
  Warnings:

  - You are about to drop the column `changedBy` on the `OrderStatusHistory` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `OrderStatusHistory` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[gatewayPaymentId]` on the table `Payment` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `actorId` to the `OrderStatusHistory` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "TicketParticipantRole" AS ENUM ('BUYER', 'SELLER', 'ADMIN');

-- AlterEnum
ALTER TYPE "OrderStatus" ADD VALUE 'PAYMENT_FAILED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PayoutStatus" ADD VALUE 'ON_HOLD';
ALTER TYPE "PayoutStatus" ADD VALUE 'CANCELLED';
ALTER TYPE "PayoutStatus" ADD VALUE 'REVERSED';

-- DropIndex
DROP INDEX "idx_osh_order_date";

-- AlterTable
ALTER TABLE "EventOutbox" ALTER COLUMN "schemaVersion" SET DEFAULT '5.0';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "paymentFailedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "sellerId" TEXT;

-- AlterTable
ALTER TABLE "OrderStatusHistory" DROP COLUMN "changedBy",
DROP COLUMN "createdAt",
ADD COLUMN     "actorId" TEXT NOT NULL,
ADD COLUMN     "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "OrderTracking" ALTER COLUMN "dispatchProofAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "gatewayPaymentId" TEXT;

-- AlterTable
ALTER TABLE "ReturnRequest" ADD COLUMN     "sellerId" TEXT;

-- AlterTable
ALTER TABLE "SellerScore" ALTER COLUMN "calculatedAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "SupportTicket" ADD COLUMN     "disputeId" TEXT;

-- CreateTable
CREATE TABLE "SupportTicketMessage" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "senderRole" "TicketParticipantRole" NOT NULL,
    "message" TEXT NOT NULL,
    "attachments" TEXT[],
    "clientMessageId" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportTicketMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DisputeEvidence" (
    "id" TEXT NOT NULL,
    "disputeId" TEXT NOT NULL,
    "uploadedBy" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DisputeEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcurementTemplate" (
    "id" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "segment" "Segment" NOT NULL,
    "items" JSONB NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProcurementTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_stm_ticket_date" ON "SupportTicketMessage"("ticketId", "createdAt");

-- CreateIndex
CREATE INDEX "idx_dev_dispute_date" ON "DisputeEvidence"("disputeId", "createdAt");

-- CreateIndex
CREATE INDEX "idx_pt_buyer_seg_del" ON "ProcurementTemplate"("buyerId", "segment", "isDeleted");

-- CreateIndex
CREATE INDEX "idx_inv_updated_at" ON "Inventory"("updatedAt");

-- CreateIndex
CREATE INDEX "idx_invres_active_expiry" ON "InventoryReservation"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "idx_osh_order_date" ON "OrderStatusHistory"("orderId", "timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "idx_pay_gateway_payment_id" ON "Payment"("gatewayPaymentId");

-- AddForeignKey
ALTER TABLE "SupportTicketMessage" ADD CONSTRAINT "SupportTicketMessage_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisputeEvidence" ADD CONSTRAINT "DisputeEvidence_disputeId_fkey" FOREIGN KEY ("disputeId") REFERENCES "Dispute"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcurementTemplate" ADD CONSTRAINT "ProcurementTemplate_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
