import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { OnboardingService } from './onboarding.service';
import { UsersRepository } from './repositories/users.repository';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [UsersController],
  providers: [UsersService, OnboardingService, UsersRepository],
  exports: [UsersService, UsersRepository, AuthModule],
})
export class UsersModule {}
