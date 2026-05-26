import { Injectable, Logger, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { UsersRepository } from './repositories/users.repository';
import type { OnboardBusinessDto } from '@vyaparnet/types';
import type { User, Business } from '@vyaparnet/database';

/**
 * OnboardingService — handles first-time user onboarding.
 *
 * Onboarding creates: User profile update + Business + Address
 * All in a SINGLE atomic Prisma transaction.
 *
 * Business rules:
 * - A user can only onboard once (idempotent check)
 * - GST number is optional at onboarding
 * - Segment is set during onboarding and drives all future filtering
 *
 * Authority: VyaparNet_IA_Final_Master_Freeze_v3.docx Section 3 (Buyer onboarding)
 */
@Injectable()
export class OnboardingService {
  private readonly logger = new Logger(OnboardingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly usersRepository: UsersRepository,
  ) {}

  /**
   * Complete user onboarding.
   * Creates Business + Address, updates User profile.
   * ATOMIC — all or nothing.
   */
  async onboard(
    userId: string,
    dto: OnboardBusinessDto,
    ipAddress?: string,
  ): Promise<{ user: User; business: Business }> {
    // Idempotency: check if already onboarded
    const alreadyOnboarded = await this.usersRepository.hasOnboarded(userId);
    if (alreadyOnboarded) {
      throw new ConflictException({
        code: 'ALREADY_ONBOARDED',
        message: 'User has already completed onboarding.',
      });
    }

    // Business slug from name
    const slug = this.generateSlug(dto.businessName, userId);
    const auditMonth = this.currentAuditMonth();

    // Atomic transaction: User update + Business + Address + AuditLog
    const result = await this.prisma.$transaction(async (tx) => {
      // Update user profile
      const updatedUser = await tx.user.update({
        where: { id: userId },
        data: {
          language: dto.language,
          segment: dto.segment,
          updatedAt: new Date(),
        },
      });

      // Create business
      const business = await tx.business.create({
        data: {
          ownerId: userId,
          name: dto.businessName,
          displayName: dto.businessName,
          slug,
          segment: dto.segment,
          gstNumber: dto.gstNumber ?? undefined,
          kycStatus: 'UNVERIFIED',
        },
      });

      // Create address (primary address)
      await tx.address.create({
        data: {
          userId,
          name: dto.businessName,
          line1: `${dto.city}, ${dto.state}`,
          city: dto.city,
          state: dto.state,
          pincode: dto.pincode,
          country: 'India',
          isDefault: true,
        },
      });

      // AuditLog — onboarding complete
      await tx.auditLog.create({
        data: {
          actorId: userId,
          action: 'CREATE',
          entityType: 'Business',
          entityId: business.id,
          entityName: dto.businessName,
          newValue: {
            businessId: business.id,
            segment: dto.segment,
            hasGst: !!dto.gstNumber,
          },
          ipAddress: ipAddress ?? undefined,
          auditMonth,
        },
      });

      return { user: updatedUser, business };
    });

    this.logger.log(
      { userId, businessId: result.business.id, segment: dto.segment },
      'User onboarding complete',
    );

    return result;
  }

  private generateSlug(name: string, userId: string): string {
    const base = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 50);
    const suffix = userId.slice(-6);
    return `${base}-${suffix}`;
  }

  private currentAuditMonth(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }
}
