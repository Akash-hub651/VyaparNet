import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { UserRole, KycStatus, Prisma } from '@vyaparnet/database';
import type { AdminUserListQuery } from '@vyaparnet/types';

// ─── DTO shapes returned to callers ─────────────────────────────────────────

export interface UserSummaryDto {
  id: string;
  phone: string;
  email: string | null;
  name: string | null;
  role: UserRole;
  segment: string;
  kycStatus: KycStatus;
  isDeleted: boolean;
  deletedAt: string | null;
  createdAt: string;
}

export interface UserBusinessDto {
  id: string;
  name: string;
  slug: string;
  kycStatus: KycStatus;
  segment: string;
}

export interface UserOrderSummaryDto {
  id: string;
  orderNumber: string;
  status: string;
  grandTotal: string;
  createdAt: string;
}

export interface UserDetailDto extends UserSummaryDto {
  language: string;
  isPhoneVerified: boolean;
  tokenVersion: number;
  businesses: UserBusinessDto[];
  recentOrders: UserOrderSummaryDto[];
}

export interface UserListResponse {
  data: UserSummaryDto[];
  nextCursor: string | null;
  hasMore: boolean;
}

/**
 * AdminUserRepository — cross-domain admin reads/writes on User via direct Prisma (INV-S7-26).
 *
 * NEVER imports domain module repositories.
 * All writes (suspend, activate, changeRole) accept a Prisma TransactionClient parameter
 * so they are called inside the $transaction (INV-S7-10).
 *
 * Authority: §20 Phase 5.
 */
@Injectable()
export class AdminUserRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Paginated user list — cursor-based (by User.createdAt desc).
   * Supports filter by role, kycStatus, segment, isDeleted, search (phone/email).
   */
  async findMany(filter: AdminUserListQuery): Promise<UserListResponse> {
    const users = await this.prisma.user.findMany({
      where: {
        ...(filter.role && { role: filter.role }),
        ...(filter.kycStatus && { kycStatus: filter.kycStatus }),
        ...(filter.segment && { segment: filter.segment as any }),
        ...(filter.isDeleted !== undefined && { isDeleted: filter.isDeleted }),
        ...(filter.search && {
          OR: [
            {
              phone: { contains: filter.search, mode: 'insensitive' as const },
            },
            {
              email: { contains: filter.search, mode: 'insensitive' as const },
            },
            { name: { contains: filter.search, mode: 'insensitive' as const } },
          ],
        }),
        ...(filter.cursor && { id: { lt: filter.cursor } }),
      },
      orderBy: { createdAt: 'desc' },
      take: filter.limit + 1,
    });

    const hasMore = users.length > filter.limit;
    const items = hasMore ? users.slice(0, filter.limit) : users;
    const nextCursor = hasMore ? items[items.length - 1].id : null;

    return {
      data: items.map((u) => this.toSummaryDto(u)),
      nextCursor,
      hasMore,
    };
  }

  /**
   * User detail — includes businesses + recent 10 orders (as buyer).
   * Returns null if not found.
   */
  async findById(id: string): Promise<UserDetailDto | null> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        ownedBusinesses: {
          where: { isDeleted: false },
          select: {
            id: true,
            name: true,
            slug: true,
            kycStatus: true,
            segment: true,
          },
        },
        orders: {
          where: { isDeleted: false },
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: {
            id: true,
            orderNumber: true,
            status: true,
            grandTotal: true,
            createdAt: true,
          },
        },
      },
    });

    if (!user) return null;

    return {
      ...this.toSummaryDto(user),
      language: user.language,
      isPhoneVerified: user.isPhoneVerified,
      tokenVersion: user.tokenVersion,
      businesses: user.ownedBusinesses.map((b) => ({
        id: b.id,
        name: b.name,
        slug: b.slug,
        kycStatus: b.kycStatus,
        segment: b.segment,
      })),
      recentOrders: user.orders.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        status: o.status,
        grandTotal: o.grandTotal.toString(),
        createdAt: o.createdAt.toISOString(),
      })),
    };
  }

  /**
   * suspendUser — sets isDeleted=true, deletedAt=now(), tokenVersion+=1.
   * MUST be called inside a $transaction (INV-S7-10 — part of atomic triple).
   * FOOTGUN-5-A: tokenVersion increment is MANDATORY here.
   */
  async suspendUser(
    userId: string,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    await tx.user.update({
      where: { id: userId },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
        tokenVersion: { increment: 1 }, // INV-S7-10 ← CRITICAL (FOOTGUN-5-A avoidance)
      },
    });
  }

  /**
   * revokeAllSessions — bulk-revokes all active LoginSessions.
   * MUST be called inside the SAME $transaction as suspendUser (FOOTGUN-5-B avoidance).
   */
  async revokeAllSessions(
    userId: string,
    reason: string,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    await tx.loginSession.updateMany({
      where: { userId, revoked: false },
      data: {
        revoked: true,
        revokedAt: new Date(),
        revokeReason: reason,
      },
    });
  }

  /**
   * activateUser — sets isDeleted=false, clears deletedAt.
   * FOOTGUN-5-F: tokenVersion is NOT changed on activation.
   *   User MUST re-login after suspension. This is intentional security behavior.
   * MUST be called inside a $transaction.
   */
  async activateUser(
    userId: string,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    await tx.user.update({
      where: { id: userId },
      data: {
        isDeleted: false,
        deletedAt: null,
        // FOOTGUN-5-F: tokenVersion NOT decremented — user must re-login intentionally
      },
    });
  }

  /**
   * changeRole — updates User.role.
   * MUST be called inside a $transaction.
   * INV-S7-12: Only BUYER/SELLER are valid targets — enforced by Zod schema at controller.
   */
  async changeRole(
    userId: string,
    role: UserRole,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    await tx.user.update({
      where: { id: userId },
      data: { role },
    });
  }

  // ─── Private helpers ─────────────────────────────────────────────────────────

  private toSummaryDto(
    user: Prisma.UserGetPayload<Record<string, never>>,
  ): UserSummaryDto {
    return {
      id: user.id,
      phone: user.phone,
      email: user.email ?? null,
      name: user.name ?? null,
      role: user.role,
      segment: user.segment,
      kycStatus: user.kycStatus,
      isDeleted: user.isDeleted,
      deletedAt: user.deletedAt?.toISOString() ?? null,
      createdAt: user.createdAt.toISOString(),
    };
  }
}
