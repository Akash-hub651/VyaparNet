ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'PAYMENT_FAILED';
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "paymentFailedAt" TIMESTAMPTZ;
ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "sellerId" TEXT;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "gatewayPaymentId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "idx_pay_gateway_payment_id" ON "Payment" ("gatewayPaymentId") WHERE "gatewayPaymentId" IS NOT NULL;
ALTER TABLE "OrderStatusHistory" RENAME COLUMN "createdAt" TO "timestamp";
ALTER TABLE "OrderStatusHistory" RENAME COLUMN "changedBy" TO "actorId";
DROP INDEX IF EXISTS "idx_osh_order_date";
CREATE INDEX IF NOT EXISTS "idx_osh_order_date" ON "OrderStatusHistory" ("orderId", "timestamp");
