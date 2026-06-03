SPRINT_8_SCOPE_DECISIONS.md

VyaparNet — Post-Order Governance Layer

Version: v1.0 — FINAL SCOPE DECISIONS

Authority: Enterprise Product Strategy Board · Principal Marketplace Architect · Platform Governance Council · Enterprise Operations Board · Trust & Safety Committee · Returns & Disputes Architecture Board · Scalability Review Council · Security Architecture Council · AI-Agent Planning Board

Sprint 7 Handoff: DEPENDENCY STABLE — Build 0 errors, 370/370 tests, 0 cross-module violations, all DSR-7 observations classified

Status: APPROVED FOR SPRINT 8 ARCHITECTURE GENERATION

HOW TO USE THIS DOCUMENTRead §E1 (Executive Summary) first for intent.Read §D (Scope Decisions) for what is IN and OUT.Read §RET (Returns Domain) for the full return lifecycle decisions.Read §REF (Refunds Domain) for refund model and ownership decisions.Read §DSP (Disputes Domain) for dispute workflow decisions.Read §PAY (Payout Reversal) for payout hold/reversal model decisions.Read §EVI (Evidence Management) for S3 evidence governance.Read §TKT (Support Ticket Evolution) for ticket reply decision.Read §FRD (Fraud Prevention) for platform protection decisions.Read §MS (Multi-Seller) for marketplace compatibility decisions.Read §SEG (Segment) for extensibility decisions.Read §S9 (Sprint 9) for boundary decisions.Read §AI (AI-Agent Safety) for implementation trap decisions.Sprint 8 Architecture Generation uses this document as sole authority.

TABLE OF CONTENTS

§E1 — Executive Summary

§D1 — Sprint Identity

§D2 — Scope Inclusion Decisions

§D3 — Scope Exclusion Decisions

§D4 — Non-Goal Declarations

§RET — Returns Domain Decisions

§REF — Refunds Domain Decisions

§DSP — Disputes Domain Decisions

§PAY — Payout Reversal Decisions

§EVI — Evidence Management Decisions

§TKT — Support Ticket Evolution Decisions

§RFQ — RFQ / Quotation Domain Decisions

§FRD — Fraud Prevention Decisions

§MS — Multi-Seller Compatibility Decisions

§SEG — Multi-Segment Compatibility Decisions

§CF — Carried-Forward Observation Decisions (from DSR-7)

§S9 — Sprint 9 Boundary

§AI — AI-Agent Safety Decisions

§INV — Required Invariants

§ATK — Self-Attack Review

§FV — Final Scope Verdict

§E1 EXECUTIVE SUMMARY

Sprint 8 is the Post-Order Governance Layer of VyaparNet. Commerce without post-order governance is incomplete. The moment a buyer receives a wrong or damaged item, or a seller disputes an unjust return, the platform's integrity is tested. Without structured workflow, these exceptions become relationship-destroying chaos.

Core architectural insight: Everything Sprint 8 needs has been pre-positioned:

ReturnRequest model in schema v4.3 with full state machine enums (ReturnStatus: 10 states)

Dispute model in schema v4.3 with DisputeStatus (6 states) + SLA fields (firstResponseAt, escalatedAt, slaBreachedAt)

Quotation, QuotationItem, PriceNegotiation models all in schema v4.3

QuotationStatus enum fully defined: DRAFT → SENT → ACCEPTED_BY_BUYER → CONVERTED_TO_ORDER / EXPIRED / CANCELLED

BuyerLedger model in schema — credit/refund ledger entries pre-modelled

AppConfig model in schema — return windows configurable per segment without code changes

OUTBOX_EVENT_NOTIFICATION_MAP extensible — Sprint 6 locked this pattern; Sprint 8 adds handlers

Sprint 7 emits BusinessVerified / BusinessSuspended → RFQ eligibility check is ready

S3Module already handles evidence uploads (Sprint 2)

AuditSafeWriterService.safeWrite() is the established audit write pattern — Sprint 8 must use it

Philosophy:

Buyer protection first: A buyer who cannot return a wrong item will never buy again.

Seller fairness: False return claims harm sellers. Evidence requirements protect them.

Admin as arbiter: Admin resolves disputes. Never auto-resolve without human review on high-value orders.

Payout safety: Once a payout is INITIATED, it must be holdable before dispute resolution.

Audit trail on everything: Every return state change, every dispute resolution, every payout adjustment is AuditLogged.

No automation without governance: Refund disbursement is manual trigger in Sprint 8. Full automation is Sprint 9.

DSR-7 Obligations to Sprint 8:

OBS-DSR7-3: Add CANCELLED + REVERSED to PayoutStatus enum — MANDATORY in Sprint 8 Phase 0 migration

OBS-DSR7-7: Sync or delete deploy/api/schema.prisma — Sprint 8 housekeeping

Sprint 7 openDisputes: 0 placeholder → Sprint 8 fills with real data

§D1 SPRINT IDENTITY

Property

Value

Sprint

8 — Post-Order Governance Layer

Objective

Buyer can raise returns and disputes. Admin resolves with evidence. Seller responds to RFQs. Payout holds protect financial integrity. Platform achieves full commerce lifecycle closure.

Duration

2 weeks

Inherits from

Sprint 1 (auth), Sprint 2 (S3/evidence), Sprint 3 (inventory return receipt), Sprint 4 (orders/payments), Sprint 5 (seller dashboard/scorecard), Sprint 6 (notifications), Sprint 7 (admin audit/governance)

New modules

modules/trust-safety/ (ReturnModule, DisputeModule), modules/procurement/ (RFQModule)

Existing modules modified

order/ (order detail includes return/dispute relations), notification/ (add Sprint 8 EventOutbox handlers), admin/ (fill openDisputes with real count, add return inspection routes), inventory/ (RETURN_RECEIVED movement on QC approval), security/audit/ (no changes — reuse AuditSafeWriterService)

New DB models activated

ReturnRequest, Dispute, Quotation, QuotationItem, PriceNegotiation

Schema migrations

TWO new migrations: (1) PayoutStatus enum additions (CANCELLED, REVERSED, ON_HOLD); (2) SupportTicketMessage model (Sprint 7 deferred, Sprint 8 Phase 0 activates)

EventOutbox Writes

ReturnInitiated, ReturnApproved, ReturnRejected, DisputeOpened, DisputeResolved, QuoteCreated, QuoteAccepted — all inside $transaction

EventOutbox Reads

NotificationModule consumes new events (additive, no existing handlers modified)

§D2 SCOPE INCLUSION DECISIONS

D2.1 — Return Request Workflow (MANDATORY)

INCLUDED:

Feature

Decision

Rationale

POST /buyer/returns

IN

Buyer raises return on DELIVERED order. Requires orderId, itemId, reason (enum), description, images[]

GET /buyer/returns

IN

Buyer views own return requests with status

GET /buyer/returns/:id

IN

Buyer views return detail

GET /admin/returns

IN

Admin views all returns — filter by status, segment, dateFrom, dateTo

GET /admin/returns/:id

IN

Admin views return detail with evidence (signed S3 URLs)

PATCH /admin/returns/:id/approve

IN

Admin approves return → status: APPROVED_FOR_PICKUP. Creates AuditLog. Emits ReturnApproved.

PATCH /admin/returns/:id/reject

IN

Admin rejects return with mandatory reason. Status: QC_REJECTED. Creates AuditLog. Emits ReturnRejected.

PATCH /admin/returns/:id/mark-received

IN

Admin marks return as physically received → status: RECEIVED_AT_QC. Creates AuditLog.

PATCH /admin/returns/:id/qc-pass

IN

Admin passes QC → status: QC_APPROVED. Triggers refund calculation. Creates AuditLog.

PATCH /admin/returns/:id/qc-fail

IN

Admin fails QC → status: QC_REJECTED with qcNotes. Creates AuditLog.

Return eligibility check

IN

Order must be DELIVERED or COMPLETED. Return window must be open (from AppConfig). One return per (orderId, itemId) pair.

Return window configuration

IN

From AppConfig table: TEXTILE_RETURN_WINDOW_HOURS = 72, SPARE_PARTS_RETURN_WINDOW_HOURS = 48. Admin configurable. Zero code changes for new segments.

Return SLA tracking

IN

48h response SLA. slaBreachedAt set by BullMQ cron if return unresponded > 48h. Admin exception center shows SLA breaches.

ReturnInitiated / ReturnApproved / ReturnRejected notifications

IN

Buyer notified on each status change. Via sendDirect() OUTSIDE $transaction.

Inventory RETURN_RECEIVED movement

IN

On RECEIVED_AT_QC: InventoryMovement(type: RETURN_RECEIVED) created inside $transaction. NOT a stock restore — only records receipt.

DECISION D-RET-1: Return is per (orderId, itemId) pair. Full-order return = one return per item. Partial return (N of M items) = N separate ReturnRequest records. This keeps state management atomic per item and aligns with multi-item orders.

DECISION D-RET-2: Return window is enforced at API boundary. Service checks Order.completedAt + AppConfig.returnWindowHours > now(). Past window → 422 with RETURN_WINDOW_EXPIRED code. No manual override in Sprint 8 — admin override deferred to Sprint 9.

DECISION D-RET-3: Reverse logistics (pickup scheduling, courier assignment) is OUT of Sprint 8. Status APPROVED_FOR_PICKUP signals the buyer that pickup is scheduled — but actual logistics coordination is manual/offline. Sprint 9 integrates logistics provider API.

DECISION D-RET-4: Stock restoration on QC approval is a Sprint 9 decision. Sprint 8 only creates RETURN_RECEIVED movement. Whether to restore stock or write off as damaged is an inventory governance decision requiring admin judgment.

D2.2 — Refund Model (MANDATORY)

INCLUDED:

Feature

Decision

Rationale

POST /admin/returns/:id/initiate-refund

IN

Manual refund trigger after QC_APPROVED. Status → REFUND_INITIATED. Creates BuyerLedger(type: REFUND) entry. Creates AuditLog.

GET /buyer/orders/:id/refund-status

IN

Buyer checks refund status on order

BuyerLedger refund entry

IN

Every refund creates a BuyerLedger record: transactionType: REFUND, amount, balance, orderId, description

Approved refund amount

IN

ReturnRequest.approvedRefundAmount set by admin at QC_APPROVED stage. May differ from requestedRefundAmount (partial approval).

Refund calculation

IN

approvedRefundAmount = unitPrice × qty × condition_factor. condition_factor: 1.0 (QC pass), 0.5–0.9 (partial damage — admin sets manually).

REFUND_INITIATED in Payment.status

IN

Payment record updated to REFUND_INITIATED after BuyerLedger entry. Consistent with existing PaymentStatus enum.

ReturnRequest.status = REFUNDED

IN

Set after actual refund processed. Admin marks manually in Sprint 8.

DECISION D-REF-1: Automated refund disbursement to buyer's bank account is OUT of Sprint 8. Sprint 8 creates BuyerLedger(REFUND) entry and marks Payment.status = REFUND_INITIATED. Actual money movement to buyer's payment instrument is Sprint 9 (Razorpay refund API).

DECISION D-REF-2: Credit-note as refund alternative is OUT of Sprint 8. BuyerLedger with CREDIT type exists in schema — Sprint 9 activates credit-note flow when buyer wants store credit instead of bank refund.

DECISION D-REF-3: Partial refund is IN. approvedRefundAmount can be less than requestedRefundAmount. Admin enters the approved amount at QC stage. BuyerLedger entry is for the approvedRefundAmount.

DECISION D-REF-4: BuyerLedger.balance is a running balance. Service must compute currentBalance + refundAmount = newBalance and store. This makes BuyerLedger an append-only ledger — no updates, no deletes. IMMUTABLE INVARIANT.

D2.3 — Dispute Workflow (MANDATORY)

INCLUDED:

Feature

Decision

Rationale

POST /buyer/disputes

IN

Buyer raises dispute on any order in DELIVERED or COMPLETED status. Requires orderId, reason, description. Optional evidence upload.

GET /buyer/disputes

IN

Buyer views own disputes

GET /buyer/disputes/:id

IN

Buyer views dispute detail

GET /admin/disputes

IN

Admin views all disputes — filter by status, segment, dateFrom, dateTo. Priority-sorted.

GET /admin/disputes/:id

IN

Full dispute context: order, buyer profile (PII visible, logged), seller info, evidence, return requests linked to order

PATCH /admin/disputes/:id/assign

IN

Admin assigns dispute to themselves. firstResponseAt set if not already set. Creates AuditLog.

PATCH /admin/disputes/:id/under-review

IN

Admin marks UNDER_REVIEW. firstResponseAt stamped. Creates AuditLog.

PATCH /admin/disputes/:id/escalate

IN

Admin escalates → ESCALATED. escalatedAt stamped. Priority raised. Creates AuditLog. Emits DisputeEscalated notification to senior admin (via sendDirect()).

PATCH /admin/disputes/:id/resolve

IN — REQUIRES EVIDENCE

Admin resolves with documented outcome. resolution field mandatory (min 20 chars). resolvedBy = adminId. Status → RESOLVED_BUYER or RESOLVED_SELLER. Creates AuditLog. Emits DisputeResolved.

PATCH /admin/disputes/:id/close

IN

Admin closes dispute after resolution. Status → CLOSED. Creates AuditLog.

SLA tracking

IN

72h resolution SLA. slaBreachedAt set by BullMQ cron if unresolved > 72h. Admin exception center updated.

Dispute → Return linkage

IN

Dispute detail shows any ReturnRequest records for same order. Read-only relationship.

Admin exception center openDisputes

IN

Sprint 7 returned openDisputes: 0. Sprint 8 fills with actual count: status IN [OPEN, UNDER_REVIEW, ESCALATED].

DisputeOpened / DisputeResolved notification templates

IN

Buyer notified on creation and resolution.

DECISION D-DSP-1: Dispute creation is not gated on return. A buyer can dispute without having raised a return (e.g., seller never shipped, seller shipped wrong category). Dispute and Return are independent workflows that may reference the same order.

DECISION D-DSP-2: Seller-initiated disputes (seller disputes buyer's return claim) are OUT of Sprint 8. Dispute.raisedBy is currently buyerId. Seller side of dispute is Sprint 9. In Sprint 8, admin sees both buyer's claim and seller's order fulfillment evidence and makes the call.

DECISION D-DSP-3: Admin resolution outcomes: RESOLVED_BUYER (buyer wins — refund initiated), RESOLVED_SELLER (seller wins — no refund). Both must include resolution text. RESOLVED_BUYER automatically triggers payout hold on seller's pending payout (if not yet TRANSFERRED).

DECISION D-DSP-4: Dispute does NOT auto-close. Admin explicitly closes after resolution. This allows a cooling-off period where the outcome can be reviewed before formal closure.

DECISION D-DSP-5: A buyer cannot raise more than 3 disputes per order. Enforced at service layer. Fourth attempt → 422 MAX_DISPUTES_PER_ORDER_EXCEEDED.

D2.4 — Payout Reversal / Hold (MANDATORY)

INCLUDED:

Feature

Decision

Rationale

PayoutStatus.ON_HOLD

IN — NEW ENUM VALUE

Payout put on hold during dispute. Requires migration. Blocks initiation until dispute resolved.

PayoutStatus.CANCELLED

IN — NEW ENUM VALUE

Payout cancelled (order force-cancelled before payout initiated, or dispute RESOLVED_BUYER).

PayoutStatus.REVERSED

IN — NEW ENUM VALUE

Payout was INITIATED but must be reversed (rare — seller already received). Manual admin action.

POST /admin/payouts/:id/hold

IN

Admin puts payout ON_HOLD. Requires reason. Creates AuditLog.

POST /admin/payouts/:id/release-hold

IN

Admin releases hold → back to PENDING. Creates AuditLog.

PATCH /admin/payouts/:id/cancel

IN

Admin cancels PENDING or ON_HOLD payout. Creates AuditLog.

Dispute → auto-hold

IN

When dispute is opened on an order: if SellerPayout.status = PENDING, auto-set to ON_HOLD. If INITIATED, flag for manual review (no auto-reversal). Creates AuditLog.

Dispute RESOLVED_BUYER → payout cancel

IN

If dispute resolved in buyer's favour: SellerPayout(ON_HOLD) → CANCELLED. Admin manually initiates refund from cancelled payout amount. Creates AuditLog.

Dispute RESOLVED_SELLER → release hold

IN

If dispute resolved in seller's favour: SellerPayout(ON_HOLD) → PENDING (admin can now initiate). Creates AuditLog.

DECISION D-PAY-1: Schema migration for PayoutStatus enum additions (ON_HOLD, CANCELLED, REVERSED) is Sprint 8 Phase 0 — executed before any implementation begins. This resolves OBS-DSR7-3.

DECISION D-PAY-2: Payout reversal for INITIATED payouts (seller already received bank transfer) requires BOTH admin confirmation AND a reversalReason field. Stored in SellerPayout.utrNumber field (re-used for reversal reference). Sprint 8 marks REVERSED — actual bank debit is offline/manual. Automated reversal is Phase 2.

DECISION D-PAY-3: Payout hold does NOT decrement the seller's approved payout amount. SellerPayout.netPayout is immutable once created. Only status changes.

DECISION D-PAY-4: SellerPayout.orderId @@index (NOT @@unique) — multi-seller safe from Sprint 7. Sprint 8 must NOT add @@unique on this. Invariant carried forward.

D2.5 — Evidence Management (MANDATORY)

INCLUDED:

Feature

Decision

Rationale

POST /buyer/returns/:id/evidence

IN

Buyer uploads return evidence images. S3 upload. Returns signed URL (display only).

POST /buyer/disputes/:id/evidence

IN

Buyer uploads dispute evidence. S3 upload to vyaparnet-evidence-{env} bucket.

Evidence S3 bucket

IN — SEPARATE BUCKET

vyaparnet-evidence-{env} — separate from vyaparnet-kyc-docs-{env} and vyaparnet-media-{env}. Zero public-read policy.

Signed URL generation

IN

300s TTL signed URLs for evidence retrieval. Never public URLs. Access logged in AuditLog.

ReturnRequest.images[]

IN

Array of S3 keys (NOT signed URLs). Signed URLs generated at API response time.

ReturnRequest.qcImageUrl

IN

Admin's QC image S3 key (admin uploads counter-evidence during QC).

Dispute evidence

IN

Stored as Dispute.description (text) + separate DisputeEvidence table — see §EVI.3 for decision.

Max evidence files

IN

Max 5 images per return, max 10 files per dispute. Enforced at upload boundary.

Allowed file types

IN

JPEG, PNG, PDF only. Server-side MIME type validation (not just extension).

Max file size

IN

5MB per file. Enforced before S3 upload attempt.

DECISION D-EVI-1: Evidence bucket is separate from KYC and product media buckets. Security principle: different sensitivity levels in different buckets with different IAM policies. Return/dispute evidence is operationally sensitive (contains buyer PII in images potentially) — never co-mingled with product media.

DECISION D-EVI-2: Evidence is RETAINED indefinitely in Sprint 8. Evidence retention policy (e.g., delete after 2 years per DPDP Act) is Sprint 9 compliance implementation.

DECISION D-EVI-3: DisputeEvidence as a separate model vs. storing in Dispute.description:DECISION: ADD DisputeEvidence model in Sprint 8 Phase 0 migration. The existing Dispute model has no images[] array field — unlike ReturnRequest which has images String[]. A dispute can have multiple evidence files (photos of damaged goods, invoice screenshots, delivery photos). A flat string array on Dispute is insufficient for metadata tracking (file type, uploader, uploadedAt). DisputeEvidence model: id, disputeId, s3Key, fileType, uploadedBy, uploadedAt, description?.

D2.6 — RFQ / Quotation Workflow (MANDATORY)

INCLUDED:

Feature

Decision

Rationale

POST /buyer/rfq

IN

Buyer creates RFQ: product list + quantities + delivery date + segment

GET /buyer/rfq

IN

Buyer lists own RFQs with status

GET /buyer/rfq/:id

IN

Buyer views RFQ detail + quotes received

POST /seller/rfq/:id/quote

IN

Seller responds to RFQ with price, delivery terms, validity

POST /buyer/rfq/:id/negotiate

IN

Buyer counter-offers on a quote

POST /seller/rfq/:id/counter

IN

Seller counter-offers back

POST /buyer/rfq/:id/accept

IN

Buyer accepts a quote → Quotation.status = ACCEPTED_BY_BUYER

POST /buyer/rfq/:id/convert

IN

Buyer converts accepted quote → Order (calls OrderService.createFromQuotation())

GET /seller/rfq

IN

Seller sees RFQs matching their products/segment

Quote expiry worker

IN

BullMQ cron every 30 min. Finds validUntil < now() + status not terminal. Sets EXPIRED. Notifies buyer + seller.

QuoteCreated / QuoteAccepted EventOutbox events

IN

schemaVersion: '8.0'. Inside $transaction.

RFQ eligibility gate

IN

Business kycStatus must be VERIFIED to respond to RFQ. Uses BusinessVerified event from Sprint 7.

Procurement template save

IN

Buyer saves current cart as template. ProcurementTemplate stored as JSON in AppConfig or dedicated table — see §RFQ.2.

DECISION D-RFQ-1: A seller can ONLY see RFQs that match their product catalog (by segment and product list). An RFQ is NOT visible to all sellers — only sellers whose active products match the requested product IDs. Privacy: Seller A cannot see Seller B's quote on the same RFQ. Quote privacy is enforced at repository layer with sellerId scope filter.

DECISION D-RFQ-2: Procurement Template: stored as a dedicated ProcurementTemplate model (new in Phase 0 migration) rather than AppConfig. Rationale: AppConfig is for platform configuration, not user data. Template = { id, buyerId, name, items: [{productId, qty}][], createdAt }.

DECISION D-RFQ-3: Quote-to-Order conversion calls OrderService.createFromQuotation(quotationId, buyerId). This method creates a standard Order from the Quotation pricing. Quotation.orderId is set. Quotation.status = CONVERTED_TO_ORDER. No new order-creation path — reuses Sprint 4 OrderService.

DECISION D-RFQ-4: Price negotiation rounds are BOUNDED at 5 per (quotationId, sellerId) pair. Round 6 attempt → 422 NEGOTIATION_ROUNDS_EXCEEDED. Prevents endless negotiation loops.

DECISION D-RFQ-5: Seller can only respond to one RFQ at a time per buyer (not multiple competing quotes per seller for the same RFQ in Sprint 8). Multi-quote per seller is Sprint 9.

D2.7 — Support Ticket: Threaded Replies (INCLUDED — Sprint 7 DEFERRED)

INCLUDED:

Feature

Decision

Rationale

SupportTicketMessage model

IN — NEW MODEL

Sprint 7 deferred this. Sprint 8 activates. id, ticketId, senderId, senderRole, message, attachments[], createdAt

POST /admin/tickets/:id/reply

IN

Admin posts reply to ticket. Creates SupportTicketMessage. Notifies ticket owner via sendDirect().

POST /buyer/tickets/:id/reply

IN

Buyer replies to their own ticket. Creates SupportTicketMessage. Notifies admin.

GET /admin/tickets/:id/messages

IN

Admin views full conversation thread

GET /buyer/tickets/:id/messages

IN

Buyer views their ticket thread

Ticket-Dispute linkage

IN

SupportTicket.disputeId? — optional link. Admin can link ticket to dispute for unified context.

Ticket message attachments

IN

S3 upload to vyaparnet-evidence-{env} bucket. Max 3 files per message. 5MB each.

DECISION D-TKT-1: SupportTicketMessage.senderRole is an enum BUYER | SELLER | ADMIN. This correctly attributes each message without requiring a User join for display.

DECISION D-TKT-2: Ticket replies do NOT create EventOutbox events in Sprint 8. Direct sendDirect() notification to the other party. EventOutbox events for ticket replies are Sprint 9 when audit trail of ticket conversations becomes a compliance requirement.

D2.8 — Seller Scorecard Impact of Returns/Disputes (MANDATORY)

INCLUDED:

Feature

Decision

Rationale

Return rate metric

IN

returnRate = returnRequests(REFUNDED + QC_REJECTED[seller-fault]) / deliveredOrders. Updated by BullMQ scorecard worker (Sprint 5 extended).

Dispute rate metric

IN

disputeRate = disputes(RESOLVED_BUYER) / deliveredOrders. Updated when dispute resolved in buyer's favour.

Scorecard recalculation trigger

IN

Sprint 5's SellerScorecardService is extended. New trigger events: ReturnRefunded, DisputeResolvedBuyer.

Suspended seller with active disputes

IN

Admin exception center shows suspended sellers with unresolved disputes — requires payout decision before suspension is finalized.

DECISION D-SCR-1: A seller's scorecard kycStatus = SUSPENDED does NOT block dispute resolution. Admin must still resolve existing open disputes. Suspension affects new orders only (via SellerContextGuard).

D2.9 — Notification Templates for Sprint 8 Events (MANDATORY)

New templates seeded via TemplateSeedService.getTemplateDefinitions():

Template Name

Event

Channels

ReturnInitiated_BUYER_hi

ReturnInitiated

IN_APP + SMS

ReturnApproved_BUYER_hi

ReturnApproved

IN_APP + SMS

ReturnRejected_BUYER_hi

ReturnRejected

IN_APP + SMS

RefundInitiated_BUYER_hi

RefundInitiated

IN_APP + SMS + EMAIL

DisputeOpened_BUYER_hi

DisputeOpened

IN_APP

DisputeResolved_BUYER_hi

DisputeResolved

IN_APP + SMS

QuoteReceived_BUYER_hi

QuoteCreated

IN_APP

QuoteAccepted_SELLER_hi

QuoteAccepted

IN_APP + SMS

ReturnRaised_SELLER_hi

ReturnInitiated

IN_APP (seller sees buyer raised return)

English equivalents

All events

IN_APP + SMS

New OUTBOX_EVENT_NOTIFICATION_MAP entries:

ReturnInitiated, ReturnApproved, ReturnRejected,
DisputeOpened, DisputeResolved,
QuoteCreated, QuoteAccepted

§D3 SCOPE EXCLUSION DECISIONS

Excluded Item

Sprint

Rationale

Automated refund disbursement (Razorpay refund API)

Sprint 9

Requires load testing + RBI compliance + gateway certification

Credit note / store credit as refund

Sprint 9

Requires BuyerLedger(CREDIT) flow + buyer wallet UI

Seller-initiated disputes

Sprint 9

Requires Dispute.raisedBy to support SELLER role + separate workflow

Reverse logistics API integration

Phase 2

Courier API certification + SLA contracts required

Automated return window override (admin override)

Sprint 9

Requires AppConfig admin UI + override audit trail

Multi-round quote per seller on same RFQ

Sprint 9

Requires QuotationItem version tracking

Purchase Order (PO) generation

Phase 2

Legal document generation, e-sign requirement

Budget management per buyer

Phase 2

Requires enterprise buyer account structure

Complex approval chains for RFQ

Phase 2

SELLER_MANAGER role required

Advanced fraud detection ML

Phase 2

ML infrastructure required

WhatsApp notifications for return/dispute

Phase 2

Template approval required

Bulk dispute resolution

Sprint 9

Safety infrastructure required

IRN / e-Invoice on refunds

Phase 2

GSTN IRP certification

Return window admin override in Sprint 8

Sprint 9

Separate admin action with audit trail required

Automated stock restoration on QC approval

Sprint 9

Requires inventory governance decision per segment

Dispute mediation (3-party conversation)

Phase 2

Complex UX + legal implications

Return analytics / dispute analytics dashboard

Sprint 9

Analytics infrastructure

§D4 NON-GOAL DECLARATIONS

Non-Goal

Why Explicitly Prohibited

ReturnModule importing OrderModule

Returns read order data via direct Prisma (admin pattern from Sprint 7)

DisputeModule importing AdminModule

Admin reads disputes via its own AdminDisputeRepository. Dispute module ≠ Admin module

Auto-resolving disputes without admin action

Disputes MUST have human review. No auto-resolve logic.

Storing signed evidence URLs in DB

S3 keys stored. Signed URLs generated at response time. Never persisted.

Payout REVERSED without admin confirmation

REVERSED status requires explicit admin action + reversalReason. Never auto-triggered.

Return request on PROCESSING or SHIPPED orders

Return only on DELIVERED or COMPLETED. Pre-delivery issues are disputes, not returns.

Buyer modifying return request after submission

After submission, only admin can modify. Buyer can only view.

BuyerLedger update or delete

BuyerLedger is append-only. No UPDATE, no DELETE on any record.

DisputeEvidence without uploader attribution

Every evidence file records uploadedBy (userId) + uploadedAt.

RFQ visible to all sellers regardless of catalog match

Seller sees only RFQs matching their segment and product catalog.

Admin resolving dispute without resolution text

resolution field is mandatory (min 20 chars) to force documented decision.

§RET RETURNS DOMAIN DECISIONS

RET.1 — Return State Machine

PENDING
↓ admin.approve()
APPROVED_FOR_PICKUP
↓ admin.mark-received()
RECEIVED_AT_QC
↓ admin.qc-pass() ↓ admin.qc-fail()
QC_APPROVED QC_REJECTED
↓ admin.initiate-refund()
REFUND_INITIATED
↓ admin.mark-refunded()
REFUNDED

PENDING → REJECTED (admin direct rejection before pickup — e.g., return window expired at creation, or product not eligible)
QC_REJECTED → CLOSED (admin closes — no refund)
REPLACEMENT_SENT (Sprint 9 — replacement logistics)

Allowed buyer transitions: NONE post-submission. Buyer is read-only after POST /buyer/returns.

Admin transitions (all require AuditLog + Idempotency-Key):

const RETURN_ADMIN_TRANSITIONS: Record<ReturnStatus, ReturnStatus[]> = {
PENDING: ['APPROVED_FOR_PICKUP', 'QC_REJECTED'],
APPROVED_FOR_PICKUP: ['RECEIVED_AT_QC'],
RECEIVED_AT_QC: ['QC_APPROVED', 'QC_REJECTED'],
QC_APPROVED: ['REFUND_INITIATED'],
REFUND_INITIATED: ['REFUNDED'],
QC_REJECTED: ['CLOSED'],
REFUNDED: [],
CLOSED: [],
REPLACEMENT_SENT: [], // Sprint 9
PICKED_UP: ['RECEIVED_AT_QC'], // Sprint 9 logistics integration
};

RET.2 — Return Eligibility Check (Service Layer)

async validateReturnEligibility(orderId: string, itemId: string, buyerId: string): Promise<void> {
// 1. Order exists and belongs to buyer
const order = await this.prisma.order.findFirst({ where: { id: orderId, buyerId } });
if (!order) throw new NotFoundException('ORDER_NOT_FOUND');

// 2. Order is in returnable status
if (!['DELIVERED', 'COMPLETED'].includes(order.status)) {
throw new UnprocessableEntityException('ORDER_NOT_RETURNABLE');
}

// 3. Return window open
const windowKey = `${order.segment}_RETURN_WINDOW_HOURS`;
const windowHours = await this.appConfigService.getNumber(windowKey, 72);
const windowExpiry = new Date((order.completedAt ?? order.updatedAt).getTime() + windowHours \* 3600000);
if (new Date() > windowExpiry) {
throw new UnprocessableEntityException('RETURN_WINDOW_EXPIRED');
}

// 4. No existing active return for same (orderId, itemId)
const existing = await this.prisma.returnRequest.findFirst({
where: { orderId, itemId, status: { notIn: ['QC_REJECTED', 'CLOSED', 'REFUNDED'] } }
});
if (existing) throw new ConflictException('RETURN_ALREADY_EXISTS');
}

RET.3 — Return Window Configuration (AppConfig)

AppConfig.key = 'TEXTILE_RETURN_WINDOW_HOURS' → value = '72'
AppConfig.key = 'SPARE_PARTS_RETURN_WINDOW_HOURS' → value = '48'
AppConfig.key = 'DEFAULT_RETURN_WINDOW_HOURS' → value = '72'

New segment: add one AppConfig row. Zero code changes. Admin can update via PATCH /admin/config/:key.

DECISION RET.3-A: AppConfig is NOT FeatureFlag. AppConfig is for operational values (hours, limits). FeatureFlag is for boolean toggles with rollout. Return windows are AppConfig values — configurable integers, not boolean features.

RET.4 — Return SLA Worker (BullMQ)

Queue: 'return-sla'
Cron: every 30 minutes
Logic:

- Find ReturnRequest where status = PENDING AND createdAt < now() - 48h AND slaBreachedAt IS NULL
- Set slaBreachedAt = now()
- Notify admin via sendDirect()
- Update admin exception center count (via RedisService.increment('return_sla_breach_count'))

§REF REFUNDS DOMAIN DECISIONS

REF.1 — Refund Lifecycle

QC_APPROVED (ReturnRequest)
→ admin initiates refund
→ BuyerLedger(type: REFUND, amount: approvedRefundAmount) [append-only]
→ Payment.status = REFUND_INITIATED
→ ReturnRequest.status = REFUND_INITIATED
→ AuditLog created
→ Notification: RefundInitiated_BUYER_hi

→ [Sprint 9: Razorpay refund API call]
→ Payment.status = FULLY_REFUNDED or PARTIALLY_REFUNDED
→ ReturnRequest.status = REFUNDED

REF.2 — BuyerLedger Immutability Invariant

BuyerLedger is APPEND-ONLY. No UPDATE or DELETE on any ledger record. Ever.

Correction of erroneous entry: create a new BuyerLedger(type: ADJUSTMENT) entry with negative amount and description: 'Correction for {errorId}'. This maintains an auditable correction trail.

REF.3 — Partial Refund Model

// Admin sets approvedRefundAmount at QC_APPROVED stage
// requestedRefundAmount: what buyer asked for
// approvedRefundAmount: what admin approves (can be less)
// Minimum: 0 (zero = no refund, must use QC_REJECTED instead)
// Maximum: requestedRefundAmount (never exceed what buyer asked)

// BuyerLedger entry:
{
buyerId: order.buyerId,
segment: order.segment,
transactionType: 'REFUND',
orderId: order.id,
amount: returnRequest.approvedRefundAmount,
balance: previousBalance + approvedRefundAmount,
description: `Refund for return ${returnRequest.id}`,
createdBy: adminUserId,
}

§DSP DISPUTES DOMAIN DECISIONS

DSP.1 — Dispute State Machine

OPEN
↓ admin.assign() or admin.under-review()
UNDER*REVIEW
↓ admin.escalate() ↓ admin.resolve()
ESCALATED RESOLVED_BUYER or RESOLVED_SELLER
↓ admin.resolve() ↓ admin.close()
RESOLVED*\* CLOSED
↓ admin.close()
CLOSED

State machine constant:

const DISPUTE_ADMIN_TRANSITIONS: Record<DisputeStatus, DisputeStatus[]> = {
OPEN: ['UNDER_REVIEW', 'RESOLVED_BUYER', 'RESOLVED_SELLER'],
UNDER_REVIEW: ['ESCALATED', 'RESOLVED_BUYER', 'RESOLVED_SELLER'],
ESCALATED: ['RESOLVED_BUYER', 'RESOLVED_SELLER'],
RESOLVED_BUYER: ['CLOSED'],
RESOLVED_SELLER: ['CLOSED'],
CLOSED: [],
};

DSP.2 — Dispute SLA

Priority

SLA

Trigger

Normal

72h

Default

High

48h

Dispute amount > ₹50,000

Critical

24h

Order > ₹1,00,000 OR seller has ≥3 open disputes

SLA configuration from AppConfig:

DISPUTE_SLA_NORMAL_HOURS = 72
DISPUTE_SLA_HIGH_HOURS = 48
DISPUTE_SLA_CRITICAL_HOURS = 24
DISPUTE_HIGH_VALUE_THRESHOLD_INR = 50000
DISPUTE_CRITICAL_VALUE_THRESHOLD_INR = 100000

DSP.3 — Dispute → Payout Hold Integration

When DisputeService.createDispute() is called:

// Inside $transaction:
// 1. Create Dispute record
// 2. Find SellerPayout for orderId where status = PENDING
// 3. If found: update status = ON_HOLD, reason = 'DISPUTE_OPENED:{disputeId}'
// 4. Create AuditLog for payout hold (via AuditSafeWriterService OUTSIDE tx)
// 5. Create EventOutbox(DisputeOpened, schemaVersion: '8.0')
// After commit:
// 6. sendDirect(buyer, 'DisputeOpened_BUYER_hi')

DSP.4 — Dispute Resolution → Financial Action

RESOLVED_BUYER:
→ if SellerPayout.status = ON_HOLD: update to CANCELLED
→ Admin manually initiates BuyerLedger(REFUND) entry for order amount
→ AuditLog created for both payout cancel and refund

RESOLVED_SELLER:
→ if SellerPayout.status = ON_HOLD: update to PENDING (release hold)
→ No refund issued
→ AuditLog created for payout release

DSP.5 — Evidence for Dispute

DisputeEvidence model (NEW — Sprint 8 Phase 0 migration):

model DisputeEvidence {
id String @id @default(cuid())
disputeId String
s3Key String // stored key, NOT signed URL
fileType String // 'image/jpeg' | 'image/png' | 'application/pdf'
uploadedBy String // userId
uploadedAt DateTime @default(now())
description String?

dispute Dispute @relation(fields: [disputeId], references: [id])

@@index([disputeId, uploadedAt], map: "idx_de_dispute_date")
}

§PAY PAYOUT REVERSAL DECISIONS

PAY.1 — Updated PayoutStatus Lifecycle

PENDING → INITIATED → TRANSFERRED (terminal — success)
PENDING → ON_HOLD → PENDING (hold released — dispute resolved seller)
PENDING → ON_HOLD → CANCELLED (dispute resolved buyer)
PENDING → CANCELLED (terminal — order force-cancelled or dispute resolved buyer)
INITIATED → REVERSED (terminal — rare, manual, offline bank debit)

Admin transitions:

const PAYOUT_ADMIN_TRANSITIONS: Record<PayoutStatus, PayoutStatus[]> = {
PENDING: ['INITIATED', 'ON_HOLD', 'CANCELLED'],
ON_HOLD: ['PENDING', 'CANCELLED'],
INITIATED: ['TRANSFERRED', 'REVERSED'],
TRANSFERRED: [], // terminal
CANCELLED: [], // terminal
REVERSED: [], // terminal
FAILED: ['PENDING'], // retry
};

PAY.2 — Payout Hold Safety

Payout hold is ATOMIC: dispute creation + payout hold in single $transaction

If SellerPayout not found for orderId (payout not yet calculated): dispute proceeds without hold (order may be too new)

If SellerPayout.status = TRANSFERRED: cannot hold. Flag for manual review in exception center. Admin sees warning.

Payout hold is REVERSIBLE by admin at any time (not only on dispute resolution)

PAY.3 — AuditLog on Every Payout State Change

Every payout status change creates AuditLog:

{
entityType: 'SellerPayout',
entityId: payoutId,
action: AuditAction.STATUS_CHANGE,
oldValue: { status: previousStatus },
newValue: { status: newStatus, reason, disputeId? },
actorId: req.user.id, // JWT — NEVER from body
}

§EVI EVIDENCE MANAGEMENT DECISIONS

EVI.1 — Evidence S3 Bucket Architecture

Bucket

Purpose

Access

vyaparnet-media-{env}

Product images, dispatch proofs (Sprint 2)

Signed URL 300s

vyaparnet-kyc-docs-{env}

KYC documents (Sprint 2/7)

Signed URL 300s, logged

vyaparnet-evidence-{env}

Return images, dispute files, ticket attachments (Sprint 8)

Signed URL 300s, logged

S3 key pattern for evidence:

returns/{returnId}/{timestamp}_{filename}
disputes/{disputeId}/{timestamp}_{filename}
tickets/{ticketId}/messages/{messageId}/{timestamp}\_{filename}

EVI.2 — Evidence Access Governance

Evidence Type

Buyer Access

Seller Access

Admin Access

Return images

OWN ONLY

NOT VISIBLE

ALL (signed URL, logged)

Dispute evidence

OWN ONLY (what they uploaded)

NOT VISIBLE

ALL (signed URL, logged)

QC images

NOT VISIBLE

NOT VISIBLE

ALL

Ticket attachments

OWN TICKET ONLY

NOT VISIBLE

ALL

EVI.3 — MIME Type Validation

Server-side validation using file-type npm package (reads magic bytes — not just extension):

Return images: image/jpeg, image/png, image/webp

Dispute evidence: image/jpeg, image/png, application/pdf

Ticket attachments: image/jpeg, image/png, application/pdf

Executable files → reject with 422 INVALID_FILE_TYPE

EVI.4 — Evidence Retention (Sprint 8 Scope)

Evidence is retained indefinitely in Sprint 8. Evidence is NEVER deleted by application code. Retention policy (S3 lifecycle rules per DPDP Act requirements) is Sprint 9 compliance implementation.

§TKT SUPPORT TICKET EVOLUTION DECISIONS

TKT.1 — SupportTicketMessage Model

Sprint 7 deferred SupportTicketMessage. Sprint 8 activates:

model SupportTicketMessage {
id String @id @default(cuid())
ticketId String
senderId String
senderRole TicketParticipantRole // BUYER | SELLER | ADMIN (new enum)

message String
attachments String[] // S3 keys array

createdAt DateTime @default(now())
isDeleted Boolean @default(false)

ticket SupportTicket @relation(fields: [ticketId], references: [id])
sender User @relation(fields: [senderId], references: [id])

@@index([ticketId, createdAt], map: "idx_stm_ticket_date")
}

TKT.2 — Ticket → Dispute Linkage

SupportTicket.disputeId String? — optional FK to Dispute. Admin links ticket to dispute when escalated. Read-only to buyer. Zero migration needed if field is added in Sprint 8 migration.

TKT.3 — Seller Access to Tickets

Seller CANNOT raise support tickets in Sprint 8. Seller has their own dashboard and seller KYC/payout concerns go through admin contact. Sprint 9: seller ticket portal.

§RFQ RFQ / QUOTATION DOMAIN DECISIONS

RFQ.1 — Module Structure

apps/api/src/modules/
├── procurement/
│ ├── procurement.module.ts
│ ├── rfq/
│ │ ├── rfq.controller.ts ← buyer routes: /buyer/rfq
│ │ ├── rfq-seller.controller.ts ← seller routes: /seller/rfq
│ │ ├── rfq.service.ts
│ │ └── rfq.repository.ts
│ └── templates/
│ ├── procurement-template.service.ts
│ └── procurement-template.repository.ts
└── trust-safety/
├── trust-safety.module.ts
├── returns/
│ ├── returns.controller.ts ← buyer routes
│ ├── returns-admin.controller.ts ← admin routes (in admin module)
│ ├── returns.service.ts
│ └── returns.repository.ts
└── disputes/
├── disputes.controller.ts ← buyer routes
├── disputes-admin.controller.ts ← admin routes (in admin module)
├── disputes.service.ts
└── disputes.repository.ts

RFQ.2 — ProcurementTemplate Model (New)

model ProcurementTemplate {
id String @id @default(cuid())
buyerId String
name String
segment Segment
items Json // [{productId, productName, quantity}]

createdAt DateTime @default(now())
updatedAt DateTime @updatedAt
isDeleted Boolean @default(false)

buyer User @relation(fields: [buyerId], references: [id])

@@index([buyerId, segment, isDeleted], map: "idx_pt_buyer_seg")
}

RFQ.3 — Quote Visibility Enforcement

INV-S8-RFQ-1: A seller MUST NOT see another seller's quote on the same RFQ. QuotationItem is scoped by Quotation.sellerId. When a buyer requests quote comparison, the API returns ALL quotes for that RFQ (admin) or only quotes directed to that buyer (buyer view). Seller sees ONLY their own submissions.

RFQ.4 — RFQ Eligibility

Check

Enforcement

Buyer must be KYC verified

kycStatus = VERIFIED (if feature_kyc_enforcement_enabled = true)

Seller must be KYC verified to respond

kycStatus = VERIFIED always — unverified sellers cannot quote

Minimum RFQ quantity

AppConfig.RFQ_MIN_QUANTITY_TEXTILE = 10 (segment-configurable)

Maximum concurrent RFQs per buyer

AppConfig.RFQ_MAX_CONCURRENT = 10

§FRD FRAUD PREVENTION DECISIONS

FRD.1 — Return Fraud Prevention

Attack

Defense

Buyer raises fake return (item was fine)

Admin QC inspection — physical verification before refund

Buyer submits return after window

validateReturnEligibility() enforces window at API boundary

Buyer submits duplicate return for same item

findFirst({ where: { orderId, itemId, status: { notIn: [terminal] } } }) — conflict rejected

Buyer uploads forged evidence (different product photo)

QC inspection is manual — admin views evidence AND inspects physical item

Buyer returns a different (lower quality) item

qcNotes + qcImageUrl during RECEIVED_AT_QC — admin documents condition

Return after order already disputed

Return eligibility check: if active dispute exists for same order, return blocked until dispute resolved

DECISION FRD.1-A: Return + Dispute mutual exclusion: A buyer CANNOT have both an active ReturnRequest AND an active Dispute for the same (orderId, itemId). If a dispute is opened and a return exists, the return is paused (status stays, no admin action). If a return is QC_APPROVED, a dispute for same item is automatically CLOSED. Service layer enforces this.

FRD.2 — Dispute Fraud Prevention

Attack

Defense

Buyer raises false dispute to delay payout

Max 3 disputes per order. SLA-tracked — admin must respond. Pattern detection Sprint 9.

Buyer raises dispute with fabricated evidence

Evidence reviewed by admin. DisputeEvidence.uploadedBy tracked.

Seller manipulates evidence

Dispatch proof from OrderTracking.dispatchProofUrl (Sprint 5) is immutable — stored at dispatch time.

Admin resolves in own favour (corrupt admin)

AuditLog on every resolution. Resolution text mandatory. Two-admin review is Sprint 9.

Repeated fake return to defraud seller

returnRate on seller scorecard also tracks buyer returnRate pattern in Sprint 9.

FRD.3 — RFQ Fraud Prevention

Attack

Defense

Seller sees competitor's quote

Quotation scoped to sellerId at repository layer

Buyer creates fake RFQ to extract pricing intel

RFQ creation requires verified buyer account

Seller submits non-competitive quote to block RFQ

Buyer can accept any quote or let expire — no forced acceptance

Price manipulation via fake negotiation rounds

Max 5 negotiation rounds per (quotationId, sellerId)

FRD.4 — Evidence Security

MIME type validation (magic bytes — not extension)

Max file size 5MB (prevents DoS via large file upload)

S3 pre-signed upload URL pattern: backend generates upload URL, client uploads directly — backend verifies upload completion before recording S3 key

Evidence S3 bucket has zero public-read. All access via signed URLs. Access logged in AuditLog.

§MS MULTI-SELLER COMPATIBILITY DECISIONS

MS.1 — What Sprint 8 Must Preserve

Constraint

Decision

ReturnRequest.orderId — one order, one seller

Current model correct. Multi-item order return = one ReturnRequest per item. Multi-seller future: one ReturnRequest per (item, sellerId).

SellerPayout.orderId @@index NOT @@unique

NEVER add @@unique. Sprint 7 invariant preserved. Sprint 8 must not touch this constraint.

Dispute.raisedBy → User.id

Current: buyer raises. Multi-seller future: dispute can involve multiple sellers (Sprint 9). Model is open — no hardcoded single-seller assumption.

Payout hold scoped to SellerPayout record

If multi-seller order: each seller has own SellerPayout record. Dispute for one seller's item only holds that seller's payout. Not other sellers.

MS.2 — What Sprint 8 Must Avoid

NEVER conflate Order.sellerId (Business.id) with User.id in return/dispute APIs

NEVER assume one seller per order in payout hold logic — use SellerPayout.orderId lookup (may return multiple records in future)

NEVER add @@unique to SellerPayout.orderId

NEVER build return logic assuming only one ReturnRequest per order (use per-item logic)

MS.3 — What Sprint 8 Must Prepare For

ReturnRequest.sellerId? field: optional for now, Sprint 9 will populate for multi-seller attribution

Dispute.sellerIds String[]: placeholder for multi-seller disputes — Sprint 9 adds when order supports multiple sellers

§SEG MULTI-SEGMENT COMPATIBILITY DECISIONS

All return, dispute, RFQ list endpoints include optional segment filter

Return windows configured per segment in AppConfig (no code changes for new segment)

RFQ minimum quantities configured per segment in AppConfig

ReturnRequest.@@index([orderId, status]) — segment can be added as filter (via Order.segment join)

Dispute SLA thresholds configurable per segment via AppConfig in Sprint 9

EventOutbox payload segment field on all Sprint 8 events

NotificationType.RETURN and NotificationType.DISPUTE already exist in schema enum — zero schema change

Adding ELECTRONICS or FOOD segment: Zero Sprint 8 code changes. One AppConfig row per return window, one AppConfig row per RFQ minimum quantity.

§CF CARRIED-FORWARD OBSERVATION DECISIONS

Observation

Classification

Sprint 8 Action

OBS-DSR7-3 PayoutStatus missing CANCELLED/REVERSED

SPRINT 8 — REQUIRED

Add CANCELLED, REVERSED, ON_HOLD to PayoutStatus enum. Migration: 20260603_sprint8_payout_status. Phase 0 of Sprint 8.

OBS-DSR7-7 deploy/api/schema.prisma stale

SPRINT 8 — HOUSEKEEPING

Delete deploy/api/schema.prisma or update CI to auto-generate from source. Sprint 8 Phase 0.

Sprint 7 openDisputes: 0 placeholder

SPRINT 8 — REQUIRED

AdminExceptionService.getExceptions() fills openDisputes with actual Dispute.status IN [OPEN, UNDER_REVIEW, ESCALATED] count.

Sprint 6 SupportTicketMessage deferred

SPRINT 8 — REQUIRED

Activate SupportTicketMessage model. Migration: 20260603_sprint8_ticket_message.

§S9 SPRINT 9 BOUNDARY

Sprint 9 Needs

Sprint 8 Delivers

Status

Automated Razorpay refund disbursement

BuyerLedger(REFUND) + Payment.status = REFUND_INITIATED records

✅ READY

Credit note / store credit flow

BuyerLedger(CREDIT) model exists — Sprint 9 activates credit-note UI

✅ SCHEMA READY

Return analytics / dispute rate dashboard

returnRate + disputeRate on seller scorecard

✅ METRIC READY

Seller-initiated disputes

Dispute.raisedBy model extensible

✅ ADDITIVE

Admin return window override

AppConfig pattern established — Sprint 9 adds override endpoint

✅ READY

Automated stock restoration on QC approval

RETURN_RECEIVED InventoryMovement recorded

✅ SIGNAL READY

Bulk dispute resolution

Single dispute resolution established

✅ ADDITIVE

RFC 8058 List-Unsubscribe email header

Sprint 6 deferred

✅ ADDITIVE

Evidence retention lifecycle (S3 rules)

Evidence stored, no deletion in Sprint 8

✅ DEFERRED CORRECTLY

AuditLog table partitioning

auditMonth partition key in place

✅ READY

WhatsApp notifications for returns

INotificationChannel extensible

✅ ADDITIVE

Sprint 9 blocker count from Sprint 8: ZERO — all Sprint 9 needs are pre-positioned.

§AI AI-AGENT SAFETY DECISIONS

AI.1 — Sprint 8 Traps (22 total)

Trap ID

Description

Fix

AG-S8-1

Agent imports OrderModule into TrustSafetyModule

Read order data via direct Prisma. No domain module import.

AG-S8-2

Agent imports AdminModule into DisputeModule

Admin has its own AdminDisputeRepository. Disputes are a separate domain.

AG-S8-3

Agent puts sendDirect() inside $transaction

ALWAYS call sendDirect() AFTER $transaction commits.

AG-S8-4

Agent stores signed evidence URL in ReturnRequest.images[] or DisputeEvidence.s3Key

Store S3 key ONLY. Sign at response time. Never persist signed URL.

AG-S8-5

Agent auto-resolves dispute without admin action

NEVER auto-resolve. Every resolution requires explicit admin PATCH endpoint call.

AG-S8-6

Agent skips return eligibility check

ALWAYS call validateReturnEligibility() before creating ReturnRequest.

AG-S8-7

Agent adds @@unique to SellerPayout.orderId

@@index ONLY. Multi-seller requires N payouts per order.

AG-S8-8

Agent updates or deletes BuyerLedger record

BuyerLedger is APPEND-ONLY. Correction = new ADJUSTMENT entry.

AG-S8-9

Agent allows buyer to see another buyer's dispute

Dispute repository MUST scope where: { raisedBy: buyerId } for buyer routes.

AG-S8-10

Agent allows seller to see all quotes on same RFQ

Quotation scoped by sellerId. Quote comparisons visible to buyer only (admin sees all).

AG-S8-11

Agent writes AuditLog via direct AuditRepository.create()

ALWAYS use AuditSafeWriterService.safeWrite() OUTSIDE $transaction.

AG-S8-12

Agent hardcodes return window (72h) in TypeScript

ALWAYS read from AppConfig.getNumber('SEGMENT_RETURN_WINDOW_HOURS', default).

AG-S8-13

Agent validates evidence MIME type by extension only

Use file-type package to read magic bytes. Extension spoofing is trivial.

AG-S8-14

Agent resolves dispute without setting resolution field

resolution is mandatory (min 20 chars). Zod validation at DTO layer.

AG-S8-15

Agent puts payout hold OUTSIDE $transaction with dispute creation

Dispute creation + payout hold MUST be inside single $transaction.

AG-S8-16

Agent allows return on SHIPPED or PROCESSING order

Return eligibility: order must be DELIVERED or COMPLETED. Strict check.

AG-S8-17

Agent allows more than one active return for same (orderId, itemId)

findFirst({ notIn: [terminal] }) check BEFORE creation.

AG-S8-18

Agent hardcodes negotiation round limit

From AppConfig.RFQ_MAX_NEGOTIATION_ROUNDS = 5. Not hardcoded.

AG-S8-19

Agent sends DisputeOpened EventOutbox event schemaVersion wrong

Sprint 8 events: schemaVersion: '8.0'. Not '7.0' or '5.0'.

AG-S8-20

Agent calls PaymentService.refundPayment() in Sprint 8

refundPayment() is a stub (Sprint 9). Sprint 8 only creates BuyerLedger(REFUND).

AG-S8-21

Agent allows buyer to raise 4th dispute on same order

Max 3 disputes per order. 4th attempt → 422 MAX_DISPUTES_PER_ORDER_EXCEEDED.

AG-S8-22

Agent skips Idempotency-Key on admin PATCH endpoints

ALL admin PATCH endpoints for return/dispute state changes MUST have Idempotency-Key. Missing → 422.

AI.2 — Ownership Rules

Domain

Who Owns

Who Reads

Who Must NOT Import

ReturnRequest CRUD

TrustSafetyModule.ReturnsService

AdminModule via direct Prisma

OrderModule, PaymentModule

Dispute CRUD

TrustSafetyModule.DisputeService

AdminModule via direct Prisma

OrderModule, InventoryModule

SellerPayout status

AdminPayoutService (Sprint 7) extended

DisputeService (payout hold logic)

Any buyer/seller route

BuyerLedger entries

TrustSafetyModule.RefundService

AdminModule (read-only audit)

OrderModule

Evidence S3

TrustSafetyModule.EvidenceService

Admin with logged access

Any public route

Quotation CRUD

ProcurementModule.RfqService

AdminModule (read-only)

OrderModule

Dispute notification

NotificationModule.sendDirect()

—

Direct BullMQ from DisputeModule

AI.3 — Explicit Decisions for Ambiguous Requirements

Ambiguity

Decision

Can seller see return request?

NO — seller is NOT notified of buyer's return. Admin handles. Sprint 9 may add seller notification.

Does dispute creation auto-notify seller?

NO — dispute is between buyer and admin in Sprint 8. Seller is not a party.

Does payout hold prevent INITIATED payouts?

If status = TRANSFERRED: cannot hold. Flag for manual review. Cannot be reversed automatically.

Is RFQ visible to admin?

YES — admin can see all RFQs for governance.

Can buyer cancel a return request?

NO — after submission, only admin can change status. Buyer views only.

Does RESOLVED_SELLER trigger payout release automatically?

YES — if payout is ON_HOLD, service sets to PENDING inside $transaction with resolution.

Can admin reopen a CLOSED dispute?

NO — CLOSED is terminal. A new dispute must be raised if needed.

Is evidence required for return?

OPTIONAL for buyer. At least 1 image strongly recommended (UX prompt) but not technically required.

Is evidence required for dispute?

OPTIONAL for buyer. Admin may request more evidence via ticket reply.

§INV REQUIRED INVARIANTS

ID

Invariant

INV-S8-1

Every admin return/dispute state change MUST create an AuditLog entry

INV-S8-2

BuyerLedger is APPEND-ONLY — no update() or delete() methods on BuyerLedgerRepository

INV-S8-3

actorId in all AuditLog entries is req.user.id from JWT — NEVER from request body

INV-S8-4

Evidence S3 keys stored in DB. Signed URLs generated at response time. NEVER persisted.

INV-S8-5

Return eligibility check MUST run before ReturnRequest.create() — no bypass

INV-S8-6

Max 1 active return per (orderId, itemId) pair — enforced at service layer

INV-S8-7

Max 3 disputes per orderId — enforced at service layer

INV-S8-8

SellerPayout.orderId @@index NOT @@unique — multi-seller safe

INV-S8-9

Dispute creation + payout hold MUST be inside single $transaction

INV-S8-10

sendDirect() MUST be called OUTSIDE $transaction — after commit

INV-S8-11

Admin dispute resolution REQUIRES resolution text (min 20 chars) — Zod enforced

INV-S8-12

Return window MUST be read from AppConfig — NEVER hardcoded in TypeScript

INV-S8-13

MIME type validated server-side via magic bytes (file-type package) — extension validation alone FORBIDDEN

INV-S8-14

All Sprint 8 EventOutbox events use schemaVersion: '8.0' (exception: OrderStatusChanged stays 5.0)

INV-S8-15

deduplicationKey for Sprint 8 events: {eventType}:{entityId}:{actorId} — deterministic, no Date.now()

INV-S8-16

eventMonth: formatYearMonth(new Date()) REQUIRED in all EventOutbox creates

INV-S8-17

Seller CANNOT see another seller's quote on same RFQ — sellerId scope enforced at repository

INV-S8-18

PaymentService.refundPayment() is a STUB in Sprint 8 — NOT called. BuyerLedger entry only.

INV-S8-19

Max 5 evidence files per return, max 10 per dispute — enforced at upload boundary

INV-S8-20

Max 5 negotiation rounds per (quotationId, sellerId) — enforced at service layer

INV-S8-21

All admin PATCH endpoints for return/dispute MUST accept Idempotency-Key header — missing → 422

INV-S8-22

AuditSafeWriterService.safeWrite() is the ONLY audit write path — no direct AuditRepository.create()

INV-S8-23

DisputeEvidence MUST record uploadedBy (userId) and uploadedAt on every evidence file

INV-S8-24

Return and Dispute are MUTUALLY EXCLUSIVE per (orderId, itemId) — active dispute blocks same-item return

§ATK SELF-ATTACK REVIEW

ATK.1 — "Scope is too large"

Attack: Returns (10 states), Disputes (6 states), RFQ (full negotiation cycle), payout holds, evidence management, ticket threads, scorecard impact — is this 5 sprints of work?

Analysis:

ReturnRequest, Dispute, Quotation models in schema since v4.3 — activation only

BuyerLedger in schema — activation only

Evidence uses existing S3Module (Sprint 2)

Audit uses existing AuditSafeWriterService (Sprint 7)

Notifications use existing sendDirect() pattern (Sprint 7)

Payout hold is 3 new enum values + existing AdminPayoutService extension

SupportTicketMessage is one new model + two endpoints

Refinement: RFQ procurement templates are LOW complexity (one model, two endpoints). Ticket threads are LOW complexity (one model, four endpoints). Returns/disputes are the CORE COMPLEXITY. Scorecard impact is an extension of Sprint 5's existing scorecard worker.

Verdict: Scope is achievable in 2 weeks with the Sprint 1–7 foundation. No further scope reduction required.

ATK.2 — "Payout hold creates financial risk"

Attack: Auto-hold on dispute creation could be abused by buyers to indefinitely freeze seller payouts.

Mitigations:

Max 3 disputes per order

SLA-tracked disputes (72h admin response SLA)

Hold released on RESOLVED_SELLER

TRANSFERRED payouts cannot be held (only flagged)

Admin override: hold can be released manually at any time

Verdict: Mitigations are sufficient for MVP. Buyer behaviour analysis (Sprint 9) will detect abuse patterns.

ATK.3 — "Evidence management is a GDPR/DPDP risk"

Attack: Return/dispute evidence may contain buyer PII in images (handwritten notes, screenshots). Indefinite retention violates DPDP Act.

Mitigation in scope: Evidence access is logged. Never public. Signed URLs 300s TTL. Separate S3 bucket. Uploader attributed.

Mitigation deferred (Sprint 9): S3 lifecycle rules (auto-delete after N days). Evidence anonymisation on closed disputes.

Verdict: Sprint 8 implements necessary access controls. Retention lifecycle is Sprint 9 — correctly deferred for MVP.

ATK.4 — "RFQ expiry worker is a single-point-of-failure"

Attack: BullMQ quote expiry worker fails → expired quotes remain SENT → sellers keep responding to dead RFQs.

Mitigation: Quote expiry check also performed at submitQuote() time — if validUntil < now(), quote is rejected with QUOTE_EXPIRED. Worker failure degrades experience but doesn't cause incorrect state. Worker has retry + DLQ (Sprint 6 pattern).

Verdict: Acceptable MVP risk. Dual enforcement (worker + service check) provides resilience.

§FV FINAL SCOPE VERDICT

Sprint 8 is approved for architecture generation under the following conditions:

MANDATORY in Sprint 8 Phase 0 (Before Any Implementation):

✅ Migration: PayoutStatus enum → add ON_HOLD, CANCELLED, REVERSED

✅ Migration: SupportTicketMessage model activation

✅ Migration: DisputeEvidence model (new)

✅ Migration: ProcurementTemplate model (new)

✅ Migration: SupportTicket.disputeId String? FK (optional link)

✅ Migration: TicketParticipantRole enum (BUYER | SELLER | ADMIN)

✅ Housekeeping: Delete or sync deploy/api/schema.prisma

Scope Summary:

Domain

Complexity

Sprint 8?

Return Request Workflow

HIGH

✅ IN

Return State Machine (10 states)

MEDIUM

✅ IN

Return SLA Worker

LOW

✅ IN

Refund Model (BuyerLedger)

MEDIUM

✅ IN

Refund disbursement (Razorpay)

HIGH

❌ Sprint 9

Dispute Workflow

HIGH

✅ IN

Dispute → Payout Hold

MEDIUM

✅ IN

PayoutStatus Extension

LOW

✅ IN

Evidence Management

MEDIUM

✅ IN

RFQ / Quotation Workflow

HIGH

✅ IN

Price Negotiation

LOW

✅ IN

Quote Expiry Worker

LOW

✅ IN

Procurement Templates

LOW

✅ IN

Support Ticket Threads

LOW

✅ IN

Seller Scorecard Return/Dispute Rates

LOW

✅ IN

Admin Exception Center Updates

LOW

✅ IN

Automated refund disbursement

HIGH

❌ Sprint 9

Credit note / store credit

MEDIUM

❌ Sprint 9

Seller-initiated disputes

HIGH

❌ Sprint 9

Reverse logistics API

HIGH

❌ Phase 2

Evidence retention lifecycle

LOW

❌ Sprint 9

Stock restoration on QC

MEDIUM

❌ Sprint 9

Sprint 8 Approved Delivery:

3 new NestJS modules: TrustSafetyModule (returns + disputes), ProcurementModule (RFQ + templates)

4 new schema migrations: PayoutStatus, SupportTicketMessage, DisputeEvidence, ProcurementTemplate

8 EventOutbox event types: ReturnInitiated, ReturnApproved, ReturnRejected, DisputeOpened, DisputeResolved, QuoteCreated, QuoteAccepted, RefundInitiated

10 notification templates

2 BullMQ workers: Return SLA worker, Quote expiry worker

24 invariants

22 AI-agent traps documented

DEPENDENCY GATE

Sprint 8 may begin ONLY when:

✅ Sprint 7 DSR verdict: DEPENDENCY STABLE (CONFIRMED)

✅ 370/370 tests passing (CONFIRMED)

✅ 0 TypeScript errors (CONFIRMED)

✅ All OBS-DSR7-\* classified and actioned

Sprint 8 Gate: OPEN.

Sprint 8 Scope Decisions v1.0Authority: Enterprise Product Strategy Board + all listed review boardsDate: 2026-06-03Basis: MASTER_IMPLEMENTATION_ROADMAP.md + Sprint 1–7 Execution Locks + DSR-5, DSR-6, DSR-7Schema evidence: packages/database/prisma/schema.prisma v4.3 (ReturnRequest:948, Dispute:1140, Quotation:1204, BuyerLedger:1300)
