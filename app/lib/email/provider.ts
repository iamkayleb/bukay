export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

export type EmailSendResult = {
  id: string;
  provider: string;
  to: string;
};

export interface EmailProvider {
  readonly name: string;
  send(message: EmailMessage): Promise<EmailSendResult>;
}

export class EmailProviderError extends Error {
  readonly provider: string;
  readonly status?: number;
  readonly cause?: unknown;

  constructor(
    provider: string,
    message: string,
    options: { status?: number; cause?: unknown } = {}
  ) {
    super(message);
    this.name = "EmailProviderError";
    this.provider = provider;
    this.status = options.status;
    this.cause = options.cause;
  }
}
