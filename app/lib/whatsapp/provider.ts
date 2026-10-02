/** A positional value substituted into an approved WhatsApp template. */
export type WhatsAppTemplateParameter = string;

/** The information required to send an approved WhatsApp template. */
export type SendWhatsAppTemplateInput = {
  /** Recipient number in E.164 format. */
  to: string;
  /** The approved template name registered with the provider. */
  template: string;
  /** Template locale understood by the provider. Defaults to its configured locale. */
  language?: string;
  /** Values for the template body placeholders, in declaration order. */
  parameters: readonly WhatsAppTemplateParameter[];
};

/** The provider's acknowledgement of an accepted template message. */
export type WhatsAppSendResult = {
  /** Provider-assigned message identifier, suitable for delivery-status correlation. */
  id: string;
  /** Stable identifier for the provider that accepted the message. */
  provider: string;
  /** Recipient number supplied to the send request. */
  to: string;
};

/**
 * A failure returned by a WhatsApp provider implementation.
 *
 * Callers may retry only errors marked as `retryable`; validation and other
 * permanent failures must be surfaced to the caller without another send.
 * Implementations preserve the original error in `cause` when one is available.
 */
export class WhatsAppProviderError extends Error {
  readonly provider: string;
  readonly status?: number;
  readonly retryable: boolean;
  readonly cause?: unknown;

  constructor(
    provider: string,
    message: string,
    options: { status?: number; retryable?: boolean; cause?: unknown } = {}
  ) {
    super(message);
    this.name = "WhatsAppProviderError";
    this.provider = provider;
    this.status = options.status;
    this.retryable = options.retryable ?? false;
    this.cause = options.cause;
  }
}

/**
 * Narrows an unknown failure to the portable error contract exposed by this
 * module. This is safer than relying on `instanceof` when errors cross module
 * or execution-context boundaries.
 */
export function isWhatsAppProviderError(error: unknown): error is WhatsAppProviderError {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { name?: unknown }).name === "WhatsAppProviderError" &&
    typeof (error as { provider?: unknown }).provider === "string" &&
    typeof (error as { retryable?: unknown }).retryable === "boolean"
  );
}

/**
 * Boundary for sending approved WhatsApp templates.
 *
 * Implementations must resolve only after the provider accepts the request and return the
 * provider-issued message id. Failures are rejected as `WhatsAppProviderError` so callers can
 * inspect their HTTP status and retry only errors marked as retryable.
 */
export interface WhatsAppProvider {
  readonly name: string;
  sendTemplate(input: SendWhatsAppTemplateInput): Promise<WhatsAppSendResult>;
}
