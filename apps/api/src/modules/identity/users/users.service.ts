import { Injectable, NotFoundException } from '@nestjs/common';
import { UsersRepository } from './repositories/users.repository';
import { AuditSafeWriterService } from '../../security/audit/audit-safe-writer.service';
import { AuditAction } from '@vyaparnet/types';
import type {
  UpdateUserDto,
  UserProfileResponse,
  CreateAddressDto,
  AddressType,
} from '@vyaparnet/types';
import type { User, Business, Address } from '@vyaparnet/database';
import { UserRole, Segment, KycStatus } from '@vyaparnet/types';

/**
 * UsersService — user profile management.
 *
 * NEVER returns raw Prisma entities.
 * All responses are mapped to typed DTOs.
 *
 * Authority: VyaparNet_Implementation_Architecture_Official_Freeze_v1.md Section 4
 */
@Injectable()
export class UsersService {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly auditSafeWriterService: AuditSafeWriterService,
  ) {}

  /**
   * Get current user profile with businesses.
   */
  async getMe(userId: string): Promise<UserProfileResponse> {
    const user = await this.usersRepository.findByIdWithBusinesses(userId);
    if (!user) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'User not found.',
      });
    }
    return this.mapUserToResponse(user, user.ownedBusinesses ?? []);
  }

  /**
   * Update current user profile.
   */
  async updateMe(
    userId: string,
    dto: UpdateUserDto,
    ipAddress?: string,
  ): Promise<UserProfileResponse> {
    const user = await this.usersRepository.findById(userId);
    if (!user) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'User not found.',
      });
    }

    const updatedUser = await this.usersRepository.updateById(userId, {
      name: dto.name ?? undefined,
      email: dto.email ?? undefined,
      language: dto.language ?? undefined,
    });

    // Log profile update (async)
    void this.auditSafeWriterService.safeWrite({
      actorId: userId,
      action: AuditAction.UPDATE,
      entityType: 'User',
      entityId: userId,
      oldValue: { name: user.name, email: user.email, language: user.language },
      newValue: { name: dto.name, email: dto.email, language: dto.language },
      ipAddress,
    });

    const withBusinesses = await this.usersRepository.findByIdWithBusinesses(
      updatedUser.id,
    );
    return this.mapUserToResponse(
      updatedUser,
      withBusinesses?.ownedBusinesses ?? [],
    );
  }

  /**
   * Map Prisma User entity to response DTO.
   * NEVER return raw Prisma entity to controller.
   */
  private mapUserToResponse(
    user: User,
    businesses: Partial<Business>[],
  ): UserProfileResponse {
    return {
      id: user.id,
      phoneNumber: user.phone,
      name: user.name ?? null,
      email: user.email ?? null,
      role: user.role as unknown as UserRole,
      segment: user.segment as unknown as Segment,
      kycStatus: user.kycStatus,
      isPhoneVerified: user.isPhoneVerified,
      createdAt: user.createdAt.toISOString(),
      businesses: businesses.map((b) => ({
        id: b.id ?? '',
        name: b.name ?? '',
        segment: b.segment as unknown as Segment,
        kycStatus: (b.kycStatus as string) ?? KycStatus.UNVERIFIED,
        isVerified: b.kycStatus === 'VERIFIED',
      })),
    };
  }

  async getAddresses(userId: string): Promise<AddressType[]> {
    const addresses = await this.usersRepository.findAddressesByUserId(userId);
    return addresses.map((addr) => this.mapAddressToResponse(addr));
  }

  async createAddress(
    userId: string,
    dto: CreateAddressDto,
    ipAddress?: string,
  ): Promise<AddressType> {
    const address = await this.usersRepository.createAddress({
      userId,
      name: dto.name,
      line1: dto.line1,
      line2: dto.line2,
      city: dto.city,
      state: dto.state,
      pincode: dto.pincode,
      landmark: dto.landmark,
      isDefault: dto.isDefault,
    });

    void this.auditSafeWriterService.safeWrite({
      actorId: userId,
      action: AuditAction.CREATE,
      entityType: 'Address',
      entityId: address.id,
      newValue: dto,
      ipAddress,
    });

    return this.mapAddressToResponse(address);
  }

  private mapAddressToResponse(address: Address): AddressType {
    return {
      id: address.id,
      userId: address.userId,
      name: address.name,
      line1: address.line1,
      line2: address.line2 ?? null,
      city: address.city,
      state: address.state,
      pincode: address.pincode,
      landmark: address.landmark ?? null,
      country: address.country,
      latitude: address.latitude ?? null,
      longitude: address.longitude ?? null,
      isDefault: address.isDefault,
      createdAt: address.createdAt,
      updatedAt: address.updatedAt,
    };
  }
}
