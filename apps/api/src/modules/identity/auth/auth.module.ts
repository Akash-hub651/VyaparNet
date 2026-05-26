import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { OtpService } from './otp.service';
import { TokenService } from './token.service';
import { SessionService } from './session.service';
import { Msg91SmsService } from './sms.service';
import { AuthRepository } from './repositories/auth.repository';
import { SessionRepository } from './repositories/session.repository';
import { AuditRepository } from '../users/repositories/audit.repository';
import { AuditSafeWriterService } from '../../security/audit/audit-safe-writer.service';
import { AuthMetrics } from './auth.metrics';
import { Msg91Provider } from './providers/msg91.provider';
import { SmsProviderStrategy } from './providers/sms-provider.strategy';
import { SMS_SERVICE } from './sms.service.interface';
import type { AppConfig } from '../../../core/config/config.schema';

@Module({
  imports: [
    JwtModule.registerAsync({
      useFactory: (config: ConfigService<AppConfig, true>) => ({
        secret: config.get('JWT_SECRET'),
        signOptions: {
          algorithm: 'HS256',
          issuer: 'vyaparnet-api',
          audience: 'vyaparnet-clients',
        },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    OtpService,
    TokenService,
    SessionService,
    AuthRepository,
    SessionRepository,
    AuditRepository,
    AuditSafeWriterService,
    AuthMetrics,
    Msg91Provider,
    SmsProviderStrategy,
    // SMS Service — swap implementation via DI
    // In production: use real Msg91SmsService
    // In test: provide StubSmsService
    {
      provide: SMS_SERVICE,
      useClass: Msg91SmsService,
    },
  ],
  exports: [
    TokenService, // Exported for JwtAuthGuard
    AuthService, // Exported for future auth-related modules
    AuditRepository,
    AuditSafeWriterService,
    AuthMetrics,
  ],
})
export class AuthModule {}
