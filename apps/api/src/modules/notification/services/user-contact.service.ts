import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';

/**
 * UserContactService — resolves User contact details for notification delivery.
 *
 * GOVERNANCE (INV-S6-15):
 * - Reads User table DIRECTLY via PrismaService.
 * - MUST NOT import UsersModule or UsersService — module boundary violation.
 * - This service is INTERNAL to NotificationModule — never exported.
 *
 * SECURITY (INV-S6-7):
 * - Buyer phone/email MUST NOT appear in seller-facing notification paths.
 * - Callers are responsible for directing buyer contact to buyer notifications only.
 *
 * PII MASKING (§9.3):
 * - Phone: logged as `****${phone.slice(-4)}`
 * - Email: logged as `****@${email.split('@')[1]}`
 * - NEVER log full phone or email.
 */
@Injectable()
export class UserContactService {
  private readonly logger = new Logger(UserContactService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolve contact details for a user.
   * Returns null fields if not present — callers check INV-S6-16.
   *
   * INV-S6-16: Null phone/email → skip + warn (caller responsibility).
   */
  async getContact(userId: string): Promise<{
    userId: string;
    phone: string | null;
    email: string | null;
    name: string | null;
    language: 'hi' | 'en';
  }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, phone: true, email: true, name: true, language: true },
    });

    if (!user) {
      this.logger.warn({ userId }, 'USER_CONTACT_NOT_FOUND');
      return { userId, phone: null, email: null, name: null, language: 'hi' };
    }

    return {
      userId: user.id,
      phone: user.phone ?? null,
      email: user.email ?? null,
      name: user.name ?? null,
      language: (user.language === 'en' ? 'en' : 'hi') as 'hi' | 'en',
    };
  }

  /**
   * Resolve the owning User ID for a Business.
   *
   * Used by: handleOrderCreated (seller lookup), handleSupplierScoreUpdated.
   * Returns null if business not found — handler skips seller notification gracefully.
   *
   * INV-S6-15: Direct Prisma read — never imports SellerModule or BusinessModule.
   */
  async getBusinessOwnerUserId(businessId: string): Promise<string | null> {
    const business = await this.prisma.business.findUnique({
      where: { id: businessId, isDeleted: false },
      select: { ownerId: true },
    });
    return business?.ownerId ?? null;
  }
}
