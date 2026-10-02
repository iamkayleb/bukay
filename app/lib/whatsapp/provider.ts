import type { WhatsAppTemplateName } from "./templates";

export type WhatsAppTemplateMessage = {
  /** Recipient in E.164 format. */
  to: string;
  template: WhatsAppTemplateName;
  /** Values keyed by the template's param names. */
  params: Record<string, string>;
};

export type WhatsAppSendResult = {
  id: string;
  provider: string;
  to: string;
  /** HTTP status reported by the provider (200 on success). */
  status: number;
};

export interface WhatsAppProvider {
  readonly name: string;
  sendTemplate(message: WhatsAppTemplateMessage): Promise<WhatsAppSendResult>;
}

export class WhatsAppProviderError extends Error {
  readonly provider: string;
  readonly status?: number;
  readonly cause?: unknown;

  constructor(
    provider: string,
    message: string,
    options: { status?: number; cause?: unknown } = {}
  ) {
    super(message);
    this.name = "WhatsAppProviderError";
    this.provider = provider;
    this.status = options.status;
    this.cause = options.cause;
  }
}
