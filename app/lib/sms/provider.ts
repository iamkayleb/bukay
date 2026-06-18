export type SmsMessage = {
  to: string;
  body: string;
};

export type SmsSendResult = {
  id: string;
  provider: string;
  to: string;
};

export interface SmsProvider {
  readonly name: string;
  send(message: SmsMessage): Promise<SmsSendResult>;
}

export class SmsProviderError extends Error {
  readonly provider: string;
  readonly status?: number;
  readonly cause?: unknown;

  constructor(
    provider: string,
    message: string,
    options: { status?: number; cause?: unknown } = {}
  ) {
    super(message);
    this.name = "SmsProviderError";
    this.provider = provider;
    this.status = options.status;
    this.cause = options.cause;
  }
}
