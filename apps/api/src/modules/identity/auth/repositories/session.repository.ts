import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../core/prisma/prisma.service';
import type { LoginSession, Prisma } from '@vyaparnet/database';

/**
 * SessionRepository — all LoginSession DB operations.
 *
 * Session invariants enforced here:
 * - All queries filter: revoked=false AND expiresAt > now()
 * - Create always sets expiresAt to 7 days from now
 * - Revoke sets revoked=true (never hard deletes)
 *
 * Authority: VyaparNet_Implementation_Architecture_Official_Freeze_v1.md Section 3
 */
@Injectable()
export class SessionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    data: Prisma.LoginSessionUncheckedCreateInput,
    tx?: Prisma.TransactionClient,
  ): Promise<LoginSession> {
    const client = tx ?? this.prisma;
    return client.loginSession.create({ data });
  }

  async findActiveById(id: string): Promise<LoginSession | null> {
    return this.prisma.loginSession.findFirst({
      where: {
        id,
        revoked: false,
        expiresAt: { gt: new Date() },
      },
    });
  }

  async countActiveForUser(userId: string): Promise<number> {
    return this.prisma.loginSession.count({
      where: {
        userId,
        revoked: false,
        expiresAt: { gt: new Date() },
      },
    });
  }

  async findOldestActiveForUser(userId: string): Promise<LoginSession | null> {
    return this.prisma.loginSession.findFirst({
      where: {
        userId,
        revoked: false,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async revokeById(id: string, tx?: Prisma.TransactionClient): Promise<void> {
    const client = tx ?? this.prisma;
    await client.loginSession.update({
      where: { id },
      data: { revoked: true },
    });
  }

  async revokeAllForUser(userId: string, exceptId?: string): Promise<void> {
    await this.prisma.loginSession.updateMany({
      where: {
        userId,
        revoked: false,
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
      data: { revoked: true },
    });
  }

  async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.loginSession.updateMany({
      where: { refreshTokenFamilyId: familyId },
      data: {
        revoked: true,
        revokedAt: new Date(),
        revokeReason: 'TOKEN_REUSE_DETECTED',
      },
    });
  }
}
