import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../core/prisma/prisma.service';
import type { User } from '@vyaparnet/database';
import { UserRole, Segment } from '@vyaparnet/types';
import { normalizeIndianPhoneNumber } from '@vyaparnet/utils';

/**
 * AuthRepository — User operations specific to auth flows.
 *
 * Scope: upsert user by phone, log OTP attempts, log security events.
 * User profile operations are in UsersRepository.
 *
 * Authority: VyaparNet_Implementation_Architecture_Official_Freeze_v1.md Section 3
 */
@Injectable()
export class AuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Find a user by phone number.
   * Always filters isDeleted=false.
   */
  async findByPhone(phone: string): Promise<User | null> {
    const normalizedPhone = normalizeIndianPhoneNumber(phone);
    return this.prisma.user.findFirst({
      where: { phone: normalizedPhone, isDeleted: false },
    });
  }

  /**
   * Fetch tokenVersion for JWT validation fallback.
   */
  async findTokenVersionById(id: string): Promise<number | null> {
    const user = await this.prisma.user.findFirst({
      where: { id, isDeleted: false },
      select: { tokenVersion: true },
    });
    return user ? user.tokenVersion : null;
  }

  /**
   * Upsert a user by phone number.
   * Creates if new, updates lastActiveAt if existing.
   * Used on every successful OTP verification.
   */
  async upsertByPhone(
    phone: string,
    defaults: {
      role?: UserRole;
      segment?: Segment;
      language?: string;
    } = {},
  ): Promise<User> {
    const normalizedPhone = normalizeIndianPhoneNumber(phone);
    return this.prisma.user.upsert({
      where: { phone: normalizedPhone },
      create: {
        phone: normalizedPhone,
        role: defaults.role ?? UserRole.BUYER,
        segment: defaults.segment ?? Segment.SPARE_PARTS,
        language: defaults.language ?? 'hi',
        isPhoneVerified: true,
        kycStatus: 'UNVERIFIED',
      },
      update: {
        isPhoneVerified: true,
        updatedAt: new Date(),
      },
    });
  }

  /**
   * Log an OTP attempt (masked — never store raw OTP or phone).
   */
  async logOtpAttempt(data: {
    phone: string;
    otpHash: string;
    ipAddressHash: string;
    userAgent: string | null;
    isValid: boolean;
  }): Promise<void> {
    // Mask phone: show only last 4 digits
    const maskedPhone =
      data.phone.slice(0, 3) + 'XXXXXX' + data.phone.slice(-4);

    await this.prisma.otpAttempt.create({
      data: {
        phone: maskedPhone,
        otp: data.otpHash,
        ipAddress: data.ipAddressHash,
        userAgent: data.userAgent ?? undefined,
        isValid: data.isValid,
      },
    });
  }

  /**
   * Log a security event (suspicious activity, failed logins, lockouts).
   */
  async logSecurityEvent(data: {
    eventType: string;
    ipAddress: string;
    userId?: string;
    userAgent?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.prisma.securityEvent.create({
      data: {
        eventType: data.eventType,
        ipAddress: data.ipAddress,
        userId: data.userId ?? undefined,
        userAgent: data.userAgent ?? undefined,
        metadata: data.metadata ? (data.metadata as object) : undefined,
      },
    });
  }
}
