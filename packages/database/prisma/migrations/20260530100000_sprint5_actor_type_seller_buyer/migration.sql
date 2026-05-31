-- Sprint 5 — Fix INV-S5-22: Extend SystemActorType enum with SELLER and BUYER values
-- Authority: SPRINT_5_EXECUTION_LOCK_FINAL.md INV-S5-22
--
-- Background: The original SystemActorType enum (USER, ADMIN, SYSTEM, CRON, WORKFLOW)
-- lacked SELLER and BUYER values. This caused OrderStatusHistory.actorRole to use
-- 'USER' as a fallback for both buyer and seller actions — making audit trails
-- unsearchable and semantically incorrect for Sprint 7 admin reporting.
--
-- PostgreSQL NOTE: ALTER TYPE ... ADD VALUE must run OUTSIDE a transaction block.
-- Prisma wraps migrations in transactions, so we use 'commit' trick or direct ALTER.
-- These values are append-only (no existing rows are affected).

-- Add SELLER actor type (seller-initiated status transitions: CONFIRMED, PROCESSING, SHIPPED)
ALTER TYPE "SystemActorType" ADD VALUE IF NOT EXISTS 'SELLER';

-- Add BUYER actor type (buyer-initiated cancellations via DELETE /buyer/orders/:id)
ALTER TYPE "SystemActorType" ADD VALUE IF NOT EXISTS 'BUYER';
