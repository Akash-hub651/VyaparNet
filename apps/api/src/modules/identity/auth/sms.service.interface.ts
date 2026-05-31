/**
 * SmsService interface — abstracts SMS provider implementation.
 *
 * Pattern follows StorageService interface (Sprint 0 architecture doc).
 * Concrete implementations: Msg91SmsService, TwilioSmsService, StubSmsService.
 *
 * Swap provider by changing the DI provider in AuthModule.
 *
 * Authority: VyaparNet_Implementation_Architecture_Official_Freeze_v1.md Section 20
 */
export interface SmsService {
  sendOtp(phoneNumber: string, otp: string): Promise<SmsResult>;
  sendTransactional(phoneNumber: string, message: string): Promise<SmsResult>; // Sprint 6 addition
}

export interface SmsResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export const SMS_SERVICE = Symbol('SMS_SERVICE');
