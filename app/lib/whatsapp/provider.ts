/**
 * WhatsApp messaging port.
 *
 * Concrete adapters (Meta Cloud API, Fake) implement this interface so booking
 * notifications and conversational flows can send messages without coupling to
 * a single transport. Unit and CI tests always use FakeWhatsAppProvider.
 */

export type WhatsAppTextContent = {
  kind: "text";
  body: string;
};

/**
 * Template send payload. `name` must match an approved Meta template
 * (see `templates.ts` and `docs/WHATSAPP_TEMPLATES.md`).
 */
export type WhatsAppTemplateContent = {
  kind: "template";
  name: string;
  /** BCP-47 / Meta language code, e.g. `en` or `en_US`. */
  language: string;
  /** Ordered body parameter values for `{{1}}`, `{{2}}`, … */
  bodyParameters?: string[];
};

export type WhatsAppContent = WhatsAppTextContent | WhatsAppTemplateContent;

export type WhatsAppSendInput = {
  /** Recipient phone in E.164 (with or without leading `+`). */
  to: string;
  content: WhatsAppContent;
};

export type WhatsAppSendResult = {
  provider: string;
  /** Provider-native message id (e.g. Meta `wamid.…`). */
  id: string;
  to: string;
  /** Upstream HTTP status; successful sandbox/fake sends use 200. */
  httpStatus: number;
};

export interface WhatsAppProvider {
  readonly name: string;
  send(input: WhatsAppSendInput): Promise<WhatsAppSendResult>;
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

/**
 * Shared send validation for every WhatsAppProvider adapter.
 * Keeps Fake and Meta on the same contract before any network I/O.
 */
export function assertWhatsAppSendInput(provider: string, input: WhatsAppSendInput): void {
  if (!input.to || !input.to.trim()) {
    throw new WhatsAppProviderError(provider, "WhatsApp 'to' is required");
  }
  if (!input.content) {
    throw new WhatsAppProviderError(provider, "WhatsApp content is required");
  }
  if (input.content.kind === "text") {
    if (!input.content.body || !input.content.body.trim()) {
      throw new WhatsAppProviderError(provider, "WhatsApp text body is required");
    }
    return;
  }
  if (input.content.kind === "template") {
    if (!input.content.name || !input.content.name.trim()) {
      throw new WhatsAppProviderError(provider, "WhatsApp template name is required");
    }
    if (!input.content.language || !input.content.language.trim()) {
      throw new WhatsAppProviderError(provider, "WhatsApp template language is required");
    }
    return;
  }
  throw new WhatsAppProviderError(provider, "WhatsApp content kind is unsupported");
}

/**
 * Replace known secret values in a string before writing to logs.
 * Empty / short placeholders are ignored so they cannot blank out the message.
 */
export function redactSecrets(value: string, secrets: ReadonlyArray<string>): string {
  let result = value;
  for (const secret of secrets) {
    if (!secret || secret.length < 8) continue;
    result = result.split(secret).join("[REDACTED]");
  }
  return result;
}
