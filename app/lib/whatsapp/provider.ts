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
 * Boundary for sending approved WhatsApp templates.
 *
 * Implementations must resolve only after the provider accepts the request and return the
 * provider-issued message id. Failures are rejected so callers can apply their own retry or
 * fallback policy.
 */
export interface WhatsAppProvider {
  readonly name: string;
  sendTemplate(input: SendWhatsAppTemplateInput): Promise<WhatsAppSendResult>;
}
