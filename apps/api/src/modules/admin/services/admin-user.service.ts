import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { RedisService } from '../../../core/redis/redis.service';
import { NotificationService } from '../../notification/services/notification.service';
import { AuditSafeWriterService } from '../../security/audit/audit-safe-writer.service';
import { AdminMetricsService } from './admin-metrics.service';
import {
  AdminUserRepository,
  UserDetailDto,
  UserListResponse,
} from '../repositories/admin-user.repository';
import { BuyerLedgerRepository } from '../../trust-safety/refunds/buyer-ledger.repository';
import { formatYearMonth } from '../../order/order-state-machine';
import {
  AuditAction,
  type AdminUserListQuery,
  type AdminSuspendUserDto,
  type AdminChangeRoleDto,
} from '@vyaparnet/types';
import { EventStatus } from '@vyaparnet/database';
import type { Request } from 'express';

/**
 * AdminUserService — User Management & Suspension for Sprint 7 Phase 5.
 *
 * CRITICAL INVARIANTS:
 *  INV-S7-2:  safeWrite() ALWAYS outside $transaction
 *  INV-S7-3:  actorId = req.user.id (JWT only)
 *  INV-S7-7:  Idempotency-Key enforced on all state-change routes
 *  INV-S7-10: User suspension = isDeleted=true + tokenVersion+=1 + sessions revoked (ATOMIC)
 *  INV-S7-11: Admin CANNOT suspend/change-role on own account (pre-tx check)
 *  INV-S7-12: Role change only allows BUYER/SELLER (Zod schema enforces)
 *  INV-S7-19: sendDirect() OUTSIDE $transaction
 *  INV-S7-27: seller_biz:{userId} Redis DEL OUTSIDE $transaction (after commit)
 *  INV-S7-38: eventMonth required in all EventOutbox creates
 *
 * FOOTGUN avoidance:
 *  FOOTGUN-5-A: tokenVersion += 1 always on suspend (inside $tx via repo)
 *  FOOTGUN-5-B: suspendUser + revokeAllSessions in SAME $tx (not separate)
 *  FOOTGUN-5-C: self-check BEFORE $transaction
 *  FOOTGUN-5-D: Redis DEL OUTSIDE $transaction
 *  FOOTGUN-5-E: Zod schema uses z.enum(['BUYER','SELLER']) — never z.string()
 *  FOOTGUN-5-F: activateUser does NOT change tokenVersion — user must re-login
 */
@Injectable()
export class AdminUserService {
  private readonly logger = new Logger(AdminUserService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly notificationService: NotificationService,
    private readonly auditWriter: AuditSafeWriterService,
    private readonly userRepo: AdminUserRepository,
    private readonly metrics: AdminMetricsService,
    private readonly buyerLedgerRepo: BuyerLedgerRepository,
  ) {}

  // ─── GET /admin/users ─────────────────────────────────────────────────────

  async getUserList(filter: AdminUserListQuery): Promise<UserListResponse> {
    return this.userRepo.findMany(filter);
  }

  // ─── GET /admin/users/:id ─────────────────────────────────────────────────

  async getUserDetail(userId: string): Promise<UserDetailDto> {
    const user = await this.userRepo.findById(userId);
    if (!user) {
      throw new NotFoundException({ code: 'USER_NOT_FOUND' });
    }
    return user;
  }

  // ─── PATCH /admin/users/:id/suspend ─────────────────────────────────────

  /**
   * Suspends a user — ALL THREE operations are atomic inside $transaction (INV-S7-10).
   *   1. User.isDeleted = true, tokenVersion += 1    (FOOTGUN-5-A)
   *   2. LoginSession bulk revoke                    (FOOTGUN-5-B: same $tx)
   *   3. EventOutbox create
   *
   * Post-tx (OUTSIDE $transaction):
   *   4. AuditLog via safeWrite()                    (INV-S7-2)
   *   5. Idempotency key in Redis                    (INV-S7-7)
   *   6. DEL seller_biz:{userId}                     (INV-S7-27, FOOTGUN-5-D)
   *   7. sendDirect() notification                   (INV-S7-19)
   */
  async suspendUser(
    targetUserId: string,
    dto: AdminSuspendUserDto,
    adminUserId: string,
    idempotencyKey: string,
    req: Request,
  ): Promise<void> {
    // INV-S7-11: Self-suspension guard BEFORE $transaction (FOOTGUN-5-C)
    if (targetUserId === adminUserId) {
      throw new ForbiddenException({ code: 'ADMIN_SELF_SUSPENSION_FORBIDDEN' });
    }

    const user = await this.userRepo.findById(targetUserId);
    if (!user) {
      throw new NotFoundException({ code: 'USER_NOT_FOUND' });
    }
    if (user.isDeleted) {
      throw new ConflictException({ code: 'USER_ALREADY_SUSPENDED' });
    }

    const entityName = user.name ?? user.phone;

    // ── $TRANSACTION: atomic triple (INV-S7-10) ───────────────────────────
    await this.prisma.$transaction(async (tx) => {
      // Step 1: isDeleted=true + tokenVersion+=1 (FOOTGUN-5-A)
      await this.userRepo.suspendUser(targetUserId, tx);

      // Step 2: Revoke ALL active sessions (FOOTGUN-5-B: same $tx)
      await this.userRepo.revokeAllSessions(
        targetUserId,
        'ADMIN_SUSPENSION',
        tx,
      );

      // Step 3: EventOutbox (INV-S7-6: schemaVersion '7.0', INV-S7-38: eventMonth)
      await tx.eventOutbox.create({
        data: {
          eventType: 'UserSuspended',
          payload: {
            userId: targetUserId,
            userRole: user.role,
            reason: dto.reason,
            adminUserId,
          },
          schemaVersion: '7.0',
          eventVersion: '1.0',
          deduplicationKey: `UserSuspended:${targetUserId}:${adminUserId}`, // INV-S7-28
          eventMonth: formatYearMonth(new Date()), // INV-S7-38 ⚠️ REQUIRED
          status: EventStatus.PENDING,
        },
      });
      // NOTE: safeWrite() MUST NOT be called inside $transaction (INV-S7-2, H-P0-1)
      // The spec example at §20:1644 incorrectly shows safeWrite inside $tx — we fix it here.
    });

    // ── OUTSIDE $transaction (after commit) ───────────────────────────────

    // INV-S7-7: Idempotency key store (best-effort)
    await this.redis
      .set(
        `admin-idem:${idempotencyKey}`,
        JSON.stringify({ userId: targetUserId, action: 'suspended' }),
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
      actorId: adminUserId, // INV-S7-3: JWT only
      action: AuditAction.STATUS_CHANGE,
      entityType: 'User',
      entityId: targetUserId,
      entityName,
      oldValue: { isDeleted: false },
      newValue: { isDeleted: true, reason: dto.reason },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    // INV-S7-27: DEL seller_biz:{userId} OUTSIDE $transaction (FOOTGUN-5-D)
    await this.redis.del(`seller_biz:${targetUserId}`).catch((err: Error) => {
      this.logger.warn(
        { userId: targetUserId, err: err.message },
        'ADMIN_SELLER_BIZ_CACHE_DEL_FAILED',
      );
    });

    // INV-S7-19: sendDirect() OUTSIDE $transaction — failure is non-fatal
    await this.notificationService
      .sendDirect(targetUserId, 'AccountSuspended_SELLER_hi', {})
      .catch((err: Error) => {
        this.logger.error(
          { userId: targetUserId, err: err.message },
          'USER_SUSPENDED_NOTIFICATION_FAILED',
        );
      });

    this.metrics.userSuspendedTotal.inc({ role: user.role });
    this.logger.log(
      {
        action: 'USER_SUSPENDED',
        adminId: adminUserId,
        userId: targetUserId,
        reason: dto.reason,
      },
      'ADMIN_USER_SUSPENDED',
    );
  }

  // ─── PATCH /admin/users/:id/activate ─────────────────────────────────────

  /**
   * Activates a suspended user — sets isDeleted=false.
   * FOOTGUN-5-F: tokenVersion is NOT changed. User must re-login intentionally.
   */
  async activateUser(
    targetUserId: string,
    adminUserId: string,
    idempotencyKey: string,
    req: Request,
  ): Promise<void> {
    // INV-S7-11: Self-modification guard
    if (targetUserId === adminUserId) {
      throw new ForbiddenException({
        code: 'ADMIN_SELF_MODIFICATION_FORBIDDEN',
      });
    }

    const user = await this.userRepo.findById(targetUserId);
    if (!user) {
      throw new NotFoundException({ code: 'USER_NOT_FOUND' });
    }
    if (!user.isDeleted) {
      throw new ConflictException({ code: 'USER_NOT_SUSPENDED' });
    }

    const entityName = user.name ?? user.phone;

    await this.prisma.$transaction(async (tx) => {
      // FOOTGUN-5-F: tokenVersion NOT changed — intentional security behavior
      await this.userRepo.activateUser(targetUserId, tx);
    });

    // OUTSIDE $transaction:
    await this.redis
      .set(
        `admin-idem:${idempotencyKey}`,
        JSON.stringify({ userId: targetUserId, action: 'activated' }),
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
      entityType: 'User',
      entityId: targetUserId,
      entityName,
      oldValue: { isDeleted: true },
      newValue: { isDeleted: false },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    await this.notificationService
      .sendDirect(targetUserId, 'AccountActivated_SELLER_hi', {})
      .catch((err: Error) => {
        this.logger.error(
          { userId: targetUserId, err: err.message },
          'USER_ACTIVATED_NOTIFICATION_FAILED',
        );
      });

    this.logger.log(
      { action: 'USER_ACTIVATED', adminId: adminUserId, userId: targetUserId },
      'ADMIN_USER_ACTIVATED',
    );
  }

  // ─── PATCH /admin/users/:id/change-role ─────────────────────────────────

  /**
   * Changes user role.
   * INV-S7-12: Only BUYER/SELLER allowed — Zod schema enforces at controller.
   * INV-S7-11: Admin cannot change own role.
   * FOOTGUN-5-E: Role target MUST NOT be ADMIN/SELLER_MANAGER.
   */
  async changeUserRole(
    targetUserId: string,
    dto: AdminChangeRoleDto,
    adminUserId: string,
    idempotencyKey: string,
    req: Request,
  ): Promise<void> {
    // INV-S7-11: Self-modification guard BEFORE $transaction
    if (targetUserId === adminUserId) {
      throw new ForbiddenException({
        code: 'ADMIN_SELF_ROLE_CHANGE_FORBIDDEN',
      });
    }

    const user = await this.userRepo.findById(targetUserId);
    if (!user) {
      throw new NotFoundException({ code: 'USER_NOT_FOUND' });
    }

    const oldRole = user.role;
    const entityName = user.name ?? user.phone;

    await this.prisma.$transaction(async (tx) => {
      await this.userRepo.changeRole(targetUserId, dto.role, tx);
    });

    // OUTSIDE $transaction:
    await this.redis
      .set(
        `admin-idem:${idempotencyKey}`,
        JSON.stringify({ userId: targetUserId, role: dto.role }),
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
      entityType: 'User',
      entityId: targetUserId,
      entityName,
      oldValue: { role: oldRole },
      newValue: { role: dto.role },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    this.logger.log(
      {
        action: 'USER_ROLE_CHANGED',
        adminId: adminUserId,
        userId: targetUserId,
        oldRole,
        newRole: dto.role,
      },
      'ADMIN_USER_ROLE_CHANGED',
    );
  }

  /**
   * Retrieves paginated buyer ledger for an admin view.
   */
  async getBuyerLedger(
    buyerId: string,
    page: number,
    limit: number,
    segment?: any,
  ): Promise<any> {
    const user = await this.prisma.user.findUnique({ where: { id: buyerId } });
    if (!user) throw new NotFoundException('Buyer not found');

    return this.buyerLedgerRepo.findManyForBuyer(buyerId, {
      page,
      limit,
      segment,
    });
  }
}
