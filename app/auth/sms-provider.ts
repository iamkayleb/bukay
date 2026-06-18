export interface SmsMessage {
  to: string;
  body: string;
}

export interface SmsDeliveryReceipt {
  provider: string;
  messageId?: string;
}

export interface SmsProvider {
  sendSms(message: SmsMessage): Promise<SmsDeliveryReceipt>;
}

export class SmsProviderError extends Error {
  constructor(
    message: string,
    public readonly provider: string,
    public readonly status?: number
  ) {
    super(message);
    this.name = "SmsProviderError";
  }
}
