import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../core/prisma/prisma.service';
import type { User, Business, Address, Prisma } from '@vyaparnet/database';

/**
 * UsersRepository — User, Business, Address DB operations.
 *
 * NEVER returns raw Prisma entities to controllers.
 * Controllers receive response DTOs (mapped in UsersService).
 *
 * Authority: VyaparNet_Implementation_Architecture_Official_Freeze_v1.md Section 3
 */
@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<User | null> {
    return this.prisma.user.findFirst({
      where: { id, isDeleted: false },
    });
  }

  async incrementTokenVersion(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        tokenVersion: {
          increment: 1,
        },
      },
    });
  }

  async findByIdWithBusinesses(
    id: string,
  ): Promise<(User & { ownedBusinesses: Business[] }) | null> {
    return this.prisma.user.findFirst({
      where: { id, isDeleted: false },
      include: {
        ownedBusinesses: {
          where: { isDeleted: false },
        },
      },
    });
  }

  async updateById(id: string, data: Prisma.UserUpdateInput): Promise<User> {
    return this.prisma.user.update({
      where: { id },
      data: { ...data, updatedAt: new Date() },
    });
  }

  async createBusiness(data: Prisma.BusinessCreateInput): Promise<Business> {
    return this.prisma.business.create({ data });
  }

  async createAddress(
    data: Prisma.AddressUncheckedCreateInput,
  ): Promise<Address> {
    return this.prisma.address.create({ data });
  }

  async findAddressesByUserId(userId: string): Promise<Address[]> {
    return this.prisma.address.findMany({
      where: { userId, isDeleted: false },
      orderBy: { createdAt: 'desc' },
    });
  }

  async hasOnboarded(userId: string): Promise<boolean> {
    const count = await this.prisma.business.count({
      where: { ownerId: userId, isDeleted: false },
    });
    return count > 0;
  }
}
