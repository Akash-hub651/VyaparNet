import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { RedisService } from '../../../core/redis/redis.service';
import { S3Service } from '../../s3/s3.service';
import { NotificationService } from '../../notification/services/notification.service';
import { AuditSafeWriterService } from '../../security/audit/audit-safe-writer.service';
import { AdminMetricsService } from './admin-metrics.service';
import {
  AdminBusinessRepository,
  BusinessDetailDto,
  BusinessListResponse,
  KycDocumentDto,
} from '../repositories/admin-business.repository';
import { validateAdminKycTransition } from '../state-machines/admin-kyc-state-machine';
import { formatYearMonth } from '../../order/order-state-machine';
import {
  AuditAction,
  type AdminBusinessListQuery,
  type RejectBusinessDto,
  type SuspendBusinessDto,
} from '@vyaparnet/types';
import { KycStatus, EventStatus } from '@vyaparnet/database';
import type { Request } from 'express';

export interface BusinessDetailWithDocsResponse {
  business: BusinessDetailDto;
  kycDocs: KycDocumentDto[];
  /** Record<docId, signedUrl> — 300s expiry. Only non-REJECTED docs included (H-P1-5). */
  signedUrls: Record<string, string>;
}

/**
 * AdminKycService — KYC verification workflow for Sprint 7 Phase 3.
 *
 * CRITICAL INVARIANTS:
 *  INV-S7-2:  safeWrite() ALWAYS outside $transaction
 *  INV-S7-3:  actorId = req.user.id (JWT only — NEVER body/param)
 *  INV-S7-6:  schemaVersion: '7.0', eventVersion: '1.0' on all new events
 *  INV-S7-7:  Idempotency key stored AFTER $transaction commit
 *  INV-S7-8:  KycDocument.publicUrl stays null — signed URL never persisted
 *  INV-S7-9:  Signed URL TTL ≤ 300s
 *  INV-S7-19: sendDirect() OUTSIDE $transaction
 *  INV-S7-28: deduplicationKey = {eventType}:{entityId}:{adminUserId}
 *  INV-S7-33: AuditLog on KYC document view (action: UPDATE)
 *  INV-S7-38: eventMonth = formatYearMonth(new Date()) in ALL EventOutbox creates
 */
@Injectable()
export class AdminKycService {
  private readonly logger = new Logger(AdminKycService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly s3: S3Service,
    private readonly notificationService: NotificationService,
    private readonly auditWriter: AuditSafeWriterService,
    private readonly businessRepo: AdminBusinessRepository,
    private readonly metrics: AdminMetricsService,
  ) {}

  // ─── GET /admin/businesses ───────────────────────────────────────────────────

  async getBusinessList(
    filter: AdminBusinessListQuery,
  ): Promise<BusinessListResponse> {
    return this.businessRepo.findMany(filter);
  }

  // ─── GET /admin/businesses/:id ──────────────────────────────────────────────

  /**
   * Returns business detail + KYC docs + signed URLs.
   * ALWAYS logs AuditLog on KYC document access (INV-S7-33).
   * Signed URLs are generated only for non-REJECTED docs (H-P1-5).
   */
  async getBusinessDetail(
    businessId: string,
    adminUserId: string,
    req: Request,
  ): Promise<BusinessDetailWithDocsResponse> {
    const fetchStart = Date.now();

    const business = await this.businessRepo.findById(businessId);
    if (!business) {
      throw new NotFoundException({ code: 'BUSINESS_NOT_FOUND' });
    }

    const kycDocs = await this.businessRepo.findKycDocuments(businessId);

    // ── Signed URL generation — H-P1-5: skip REJECTED docs ──────────────────
    const signedUrls: Record<string, string> = {};
    for (const doc of kycDocs) {
      if (doc.status === KycStatus.REJECTED) continue; // H-P1-5: REJECTED docs skipped
      try {
        // INV-S7-8: s3Key stored in doc.url (never full URL)
        // INV-S7-9: TTL ≤ 300s — S3Service.getSignedUrl() hard-caps at 300
        signedUrls[doc.id] = await this.s3.getSignedUrl(doc.url, 300);
      } catch (e) {
        this.logger.warn(
          { docId: doc.id, businessId },
          'KYC_SIGNED_URL_GENERATION_FAILED',
        );
        // Continue — skip this doc. Never throw (FOOTGUN-3-F avoidance).
      }
    }

    const fetchMs = Date.now() - fetchStart;
    this.metrics.kycDocumentFetchMs.observe(fetchMs);

    // ── INV-S7-33: AuditLog on KYC doc access (OUTSIDE tx — read-only) ───────
    // H-P0-2: AuditAction.READ does not exist — use UPDATE with metadata strategy
    if (kycDocs.length > 0) {
      await this.auditWriter.safeWrite({
        actorId: adminUserId, // INV-S7-3: JWT only
        action: AuditAction.UPDATE,
        entityType: 'KycDocument',
        entityId: businessId,
        entityName: business.name,
        oldValue: undefined,
        newValue: {
          action: 'KYC_DOCUMENTS_VIEWED',
          docCount: kycDocs.length,
        },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });
    }

    this.logger.log(
      {
        action: 'KYC_DOCUMENTS_FETCHED',
        adminId: adminUserId,
        businessId,
        docCount: kycDocs.length,
        signedUrlCount: Object.keys(signedUrls).length,
      },
      'ADMIN_KYC_DETAIL_FETCHED',
    );

    return { business, kycDocs, signedUrls };
  }

  // ─── PATCH /admin/businesses/:id/verify ─────────────────────────────────────

  async verifyBusiness(
    businessId: string,
    adminUserId: string,
    idempotencyKey: string,
    req: Request,
  ): Promise<BusinessDetailDto> {
    // ── Pre-fetch current state for state machine validation ─────────────────
    const current = await this.businessRepo.findById(businessId);
    if (!current) {
      throw new NotFoundException({ code: 'BUSINESS_NOT_FOUND' });
    }

    // ── FOOTGUN-3-E: validate KYC transition BEFORE $transaction ─────────────
    validateAdminKycTransition(current.kycStatus, KycStatus.VERIFIED);

    const oldStatus = current.kycStatus;

    // ── $TRANSACTION: verify + EventOutbox ───────────────────────────────────
    await this.prisma.$transaction(async (tx) => {
      await tx.business.update({
        where: { id: businessId },
        data: { kycStatus: KycStatus.VERIFIED },
      });

      // INV-S7-6: schemaVersion '7.0', eventVersion '1.0'
      // INV-S7-28: deduplicationKey format = {eventType}:{entityId}:{adminUserId}
      // INV-S7-38: eventMonth REQUIRED — non-nullable field
      await tx.eventOutbox.create({
        data: {
          eventType: 'BusinessVerified',
          payload: {
            businessId,
            businessName: current.name,
            sellerUserId: current.ownerId,
            segment: current.segment,
            adminUserId,
          },
          schemaVersion: '7.0',
          eventVersion: '1.0',
          deduplicationKey: `BusinessVerified:${businessId}:${adminUserId}`,
          eventMonth: formatYearMonth(new Date()),
          status: EventStatus.PENDING,
        },
      });
      // NOTE: safeWrite() is NOT called inside $transaction (INV-S7-2, H-P0-1)
    });

    // ── OUTSIDE $transaction (after commit) ───────────────────────────────────

    // INV-S7-7: Store idempotency key result (best-effort)
    await this.redis
      .set(
        `admin-idem:${idempotencyKey}`,
        JSON.stringify({ businessId, kycStatus: KycStatus.VERIFIED }),
        'EX',
        86400,
      )
      .catch((err: Error) => {
        this.logger.warn(
          { idempotencyKey, err: err.message },
          'ADMIN_IDEM_REDIS_STORE_FAILED',
        );
      });

    // INV-S7-2: AuditLog OUTSIDE $transaction
    await this.auditWriter.safeWrite({
      actorId: adminUserId,
      action: AuditAction.STATUS_CHANGE,
      entityType: 'Business',
      entityId: businessId,
      entityName: current.name,
      oldValue: { kycStatus: oldStatus },
      newValue: { kycStatus: KycStatus.VERIFIED },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    // INV-S7-19: sendDirect() OUTSIDE $transaction — failure does NOT roll back
    await this.notificationService
      .sendDirect(current.ownerId, 'KycApproved_SELLER_hi', {
        businessName: current.name,
      })
      .catch((err: Error) => {
        this.logger.error(
          { businessId, sellerUserId: current.ownerId, err: err.message },
          'KYC_APPROVED_NOTIFICATION_FAILED',
        );
        // Non-fatal — business is verified regardless
      });

    this.metrics.businessVerifiedTotal.inc({ segment: current.segment });
    this.logger.log(
      {
        action: 'BUSINESS_VERIFIED',
        adminId: adminUserId,
        businessId,
        kycStatus: KycStatus.VERIFIED,
      },
      'ADMIN_KYC_VERIFIED',
    );

    const updated = await this.businessRepo.findById(businessId);
    return updated!;
  }

  // ─── PATCH /admin/businesses/:id/reject ─────────────────────────────────────

  async rejectBusiness(
    businessId: string,
    dto: RejectBusinessDto,
    adminUserId: string,
    idempotencyKey: string,
    req: Request,
  ): Promise<BusinessDetailDto> {
    const current = await this.businessRepo.findById(businessId);
    if (!current) {
      throw new NotFoundException({ code: 'BUSINESS_NOT_FOUND' });
    }

    validateAdminKycTransition(current.kycStatus, KycStatus.REJECTED);
    const oldStatus = current.kycStatus;

    await this.prisma.$transaction(async (tx) => {
      await tx.business.update({
        where: { id: businessId },
        data: { kycStatus: KycStatus.REJECTED },
      });

      await tx.eventOutbox.create({
        data: {
          eventType: 'BusinessRejected',
          payload: {
            businessId,
            businessName: current.name,
            sellerUserId: current.ownerId,
            rejectionReason: dto.reason,
            adminUserId,
          },
          schemaVersion: '7.0',
          eventVersion: '1.0',
          deduplicationKey: `BusinessRejected:${businessId}:${adminUserId}`,
          eventMonth: formatYearMonth(new Date()),
          status: EventStatus.PENDING,
        },
      });
    });

    // OUTSIDE $transaction:
    await this.redis
      .set(
        `admin-idem:${idempotencyKey}`,
        JSON.stringify({ businessId, kycStatus: KycStatus.REJECTED }),
        'EX',
        86400,
      )
      .catch((err: Error) => {
        this.logger.warn(
          { idempotencyKey, err: err.message },
          'ADMIN_IDEM_REDIS_STORE_FAILED',
        );
      });

    await this.auditWriter.safeWrite({
      actorId: adminUserId,
      action: AuditAction.STATUS_CHANGE,
      entityType: 'Business',
      entityId: businessId,
      entityName: current.name,
      oldValue: { kycStatus: oldStatus },
      newValue: { kycStatus: KycStatus.REJECTED, reason: dto.reason },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    await this.notificationService
      .sendDirect(current.ownerId, 'KycRejected_SELLER_hi', {
        businessName: current.name,
        reason: dto.reason,
      })
      .catch((err: Error) => {
        this.logger.error(
          { businessId, sellerUserId: current.ownerId, err: err.message },
          'KYC_REJECTED_NOTIFICATION_FAILED',
        );
      });

    this.metrics.businessRejectedTotal.inc({ segment: current.segment });
    this.logger.log(
      {
        action: 'BUSINESS_REJECTED',
        adminId: adminUserId,
        businessId,
        reason: dto.reason,
      },
      'ADMIN_KYC_REJECTED',
    );

    const updated = await this.businessRepo.findById(businessId);
    return updated!;
  }

  // ─── PATCH /admin/businesses/:id/suspend ────────────────────────────────────

  async suspendBusiness(
    businessId: string,
    dto: SuspendBusinessDto,
    adminUserId: string,
    idempotencyKey: string,
    req: Request,
  ): Promise<BusinessDetailDto> {
    const current = await this.businessRepo.findById(businessId);
    if (!current) {
      throw new NotFoundException({ code: 'BUSINESS_NOT_FOUND' });
    }

    validateAdminKycTransition(current.kycStatus, KycStatus.SUSPENDED);
    const oldStatus = current.kycStatus;

    await this.prisma.$transaction(async (tx) => {
      await tx.business.update({
        where: { id: businessId },
        data: { kycStatus: KycStatus.SUSPENDED },
      });

      await tx.eventOutbox.create({
        data: {
          eventType: 'BusinessSuspended',
          payload: {
            businessId,
            businessName: current.name,
            sellerUserId: current.ownerId,
            reason: dto.reason,
            adminUserId,
          },
          schemaVersion: '7.0',
          eventVersion: '1.0',
          deduplicationKey: `BusinessSuspended:${businessId}:${adminUserId}`,
          eventMonth: formatYearMonth(new Date()),
          status: EventStatus.PENDING,
        },
      });
    });

    await this.redis
      .set(
        `admin-idem:${idempotencyKey}`,
        JSON.stringify({ businessId, kycStatus: KycStatus.SUSPENDED }),
        'EX',
        86400,
      )
      .catch((err: Error) => {
        this.logger.warn(
          { idempotencyKey, err: err.message },
          'ADMIN_IDEM_REDIS_STORE_FAILED',
        );
      });

    await this.auditWriter.safeWrite({
      actorId: adminUserId,
      action: AuditAction.STATUS_CHANGE,
      entityType: 'Business',
      entityId: businessId,
      entityName: current.name,
      oldValue: { kycStatus: oldStatus },
      newValue: { kycStatus: KycStatus.SUSPENDED, reason: dto.reason },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    this.metrics.businessSuspendedTotal.inc({
      segment: current.segment,
      reason: dto.reason.slice(0, 30), // truncate label value
    });
    this.logger.log(
      {
        action: 'BUSINESS_SUSPENDED',
        adminId: adminUserId,
        businessId,
        reason: dto.reason,
      },
      'ADMIN_KYC_SUSPENDED',
    );

    const updated = await this.businessRepo.findById(businessId);
    return updated!;
  }

  // ─── PATCH /admin/businesses/:id/reactivate ──────────────────────────────────

  async reactivateBusiness(
    businessId: string,
    adminUserId: string,
    idempotencyKey: string,
    req: Request,
  ): Promise<BusinessDetailDto> {
    const current = await this.businessRepo.findById(businessId);
    if (!current) {
      throw new NotFoundException({ code: 'BUSINESS_NOT_FOUND' });
    }

    // SUSPENDED → VERIFIED is the only allowed reactivation transition
    validateAdminKycTransition(current.kycStatus, KycStatus.VERIFIED);
    const oldStatus = current.kycStatus;

    await this.prisma.$transaction(async (tx) => {
      await tx.business.update({
        where: { id: businessId },
        data: { kycStatus: KycStatus.VERIFIED },
      });

      // Reactivation emits BusinessVerified (seller is now active again)
      await tx.eventOutbox.create({
        data: {
          eventType: 'BusinessVerified',
          payload: {
            businessId,
            businessName: current.name,
            sellerUserId: current.ownerId,
            segment: current.segment,
            adminUserId,
          },
          schemaVersion: '7.0',
          eventVersion: '1.0',
          // Unique deduplication key distinguishes reactivation from initial verify
          deduplicationKey: `BusinessVerified:${businessId}:${adminUserId}:reactivate`,
          eventMonth: formatYearMonth(new Date()),
          status: EventStatus.PENDING,
        },
      });
    });

    await this.redis
      .set(
        `admin-idem:${idempotencyKey}`,
        JSON.stringify({ businessId, kycStatus: KycStatus.VERIFIED }),
        'EX',
        86400,
      )
      .catch((err: Error) => {
        this.logger.warn(
          { idempotencyKey, err: err.message },
          'ADMIN_IDEM_REDIS_STORE_FAILED',
        );
      });

    await this.auditWriter.safeWrite({
      actorId: adminUserId,
      action: AuditAction.STATUS_CHANGE,
      entityType: 'Business',
      entityId: businessId,
      entityName: current.name,
      oldValue: { kycStatus: oldStatus },
      newValue: { kycStatus: KycStatus.VERIFIED, reactivated: true },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    await this.notificationService
      .sendDirect(current.ownerId, 'KycApproved_SELLER_hi', {
        businessName: current.name,
      })
      .catch((err: Error) => {
        this.logger.error(
          { businessId, err: err.message },
          'KYC_REACTIVATED_NOTIFICATION_FAILED',
        );
      });

    this.metrics.businessVerifiedTotal.inc({ segment: current.segment });
    this.logger.log(
      {
        action: 'BUSINESS_REACTIVATED',
        adminId: adminUserId,
        businessId,
        kycStatus: KycStatus.VERIFIED,
      },
      'ADMIN_KYC_REACTIVATED',
    );

    const updated = await this.businessRepo.findById(businessId);
    return updated!;
  }
}
