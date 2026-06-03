-- Dispute queries (SLA worker + admin list)
CREATE INDEX IF NOT EXISTS idx_dispute_order ON "Dispute"("orderId");
CREATE INDEX IF NOT EXISTS idx_dispute_sla ON "Dispute"("status", "slaBreachedAt", "createdAt")
  WHERE "status" IN ('OPEN', 'UNDER_REVIEW');
CREATE INDEX IF NOT EXISTS idx_dispute_priority ON "Dispute"("priority", "createdAt")
  WHERE "status" IN ('OPEN', 'UNDER_REVIEW', 'ESCALATED');

-- ReturnRequest queries (SLA worker + admin list + mutual exclusion check)
CREATE INDEX IF NOT EXISTS idx_return_order ON "ReturnRequest"("orderId", "status");
CREATE INDEX IF NOT EXISTS idx_return_sla ON "ReturnRequest"("status", "slaBreachedAt", "createdAt")
  WHERE "status" IN ('PENDING', 'APPROVED_FOR_PICKUP', 'RECEIVED_AT_QC', 'QC_APPROVED');

-- Quotation queries (expiry worker + seller list)
CREATE INDEX IF NOT EXISTS idx_quotation_expiry ON "Quotation"("validUntil", "status")
  WHERE "status" NOT IN ('EXPIRED', 'CANCELLED', 'CONVERTED_TO_ORDER', 'ACCEPTED_BY_BUYER');
CREATE INDEX IF NOT EXISTS idx_quotation_rfq_seller ON "Quotation"("rfqId", "sellerId");

-- SupportTicketMessage (thread pagination)
CREATE INDEX IF NOT EXISTS idx_stm_ticket_date ON "SupportTicketMessage"("ticketId", "createdAt")
  WHERE "isDeleted" = false;

-- BuyerLedger (returnRequestId dedup guard)
CREATE INDEX IF NOT EXISTS idx_bl_return ON "BuyerLedger"("returnRequestId")
  WHERE "returnRequestId" IS NOT NULL;
