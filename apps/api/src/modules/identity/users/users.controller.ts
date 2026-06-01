import {
  Controller,
  Get,
  Put,
  Post,
  Body,
  Ip,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ZodValidationPipe } from '../../../shared/pipes/zod-validation.pipe';
import { CurrentUser } from '../../../shared/decorators/current-user.decorator';
import { UsersService } from './users.service';
import { OnboardingService } from './onboarding.service';
import {
  UpdateUserSchema,
  OnboardBusinessSchema,
  CreateAddressSchema,
} from '@vyaparnet/types';
import type {
  UpdateUserDto,
  OnboardBusinessDto,
  UserProfileResponse,
  CreateAddressDto,
  AddressType,
} from '@vyaparnet/types';
import type { JwtPayload } from '../auth/token.service';

/**
 * UsersController — user profile and onboarding endpoints.
 *
 * All routes require valid JWT (protected by global JwtAuthGuard).
 *
 * Authority: VyaparNet_API_Contracts_Backend_Scaffold_Blueprint.md Section 3
 */
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly onboardingService: OnboardingService,
  ) {}

  /**
   * GET /api/v1/users/me
   * Returns authenticated user profile with businesses.
   */
  @Get('me')
  async getMe(
    @CurrentUser() user: JwtPayload,
  ): Promise<{ success: true; data: UserProfileResponse }> {
    const profile = await this.usersService.getMe(user.sub);
    return { success: true, data: profile };
  }

  /**
   * PUT /api/v1/users/me
   * Update authenticated user profile.
   */
  @Put('me')
  @HttpCode(HttpStatus.OK)
  async updateMe(
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(UpdateUserSchema)) dto: UpdateUserDto,
    @Ip() ip: string,
  ): Promise<{ success: true; data: UserProfileResponse }> {
    const profile = await this.usersService.updateMe(user.sub, dto, ip);
    return { success: true, data: profile };
  }

  /**
   * POST /api/v1/users/onboard
   * Complete first-time onboarding: create business + address.
   */
  @Post('onboard')
  @HttpCode(HttpStatus.CREATED)
  async onboard(
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(OnboardBusinessSchema)) dto: OnboardBusinessDto,
    @Ip() ip: string,
  ): Promise<{ success: true; data: { message: string } }> {
    await this.onboardingService.onboard(user.sub, dto, ip);
    return {
      success: true,
      data: { message: 'Onboarding complete. Welcome to VyaparNet!' },
    };
  }

  /**
   * GET /api/v1/users/addresses
   * Returns all active addresses for the authenticated user.
   */
  @Get('addresses')
  async getAddresses(
    @CurrentUser() user: JwtPayload,
  ): Promise<{ success: true; data: AddressType[] }> {
    const addresses = await this.usersService.getAddresses(user.sub);
    return { success: true, data: addresses };
  }

  /**
   * POST /api/v1/users/addresses
   * Creates a new address for the authenticated user.
   */
  @Post('addresses')
  @HttpCode(HttpStatus.CREATED)
  async createAddress(
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(CreateAddressSchema)) dto: CreateAddressDto,
    @Ip() ip: string,
  ): Promise<{ success: true; data: AddressType }> {
    const address = await this.usersService.createAddress(user.sub, dto, ip);
    return { success: true, data: address };
  }
}
