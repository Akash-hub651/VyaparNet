export interface SendSmsPayload {
  phone: string;
  message: string;
}

export interface SmsProvider {
  sendOtp(payload: SendSmsPayload): Promise<void>;
}
