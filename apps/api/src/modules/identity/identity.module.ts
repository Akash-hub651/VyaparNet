import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';

/**
 * IdentityModule — root module for all identity and access concerns.
 *
 * Sub-modules:
 * - AuthModule: OTP, JWT, sessions, guards
 * - UsersModule: User profile, business onboarding
 *
 * Authority: VyaparNet_Implementation_Architecture_Official_Freeze_v1.md Section 2
 */
@Module({
  imports: [AuthModule, UsersModule],
  exports: [AuthModule, UsersModule],
})
export class IdentityModule {}


