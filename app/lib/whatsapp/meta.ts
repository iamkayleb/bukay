import {
  WhatsAppProvider,
  WhatsAppProviderError,
  WhatsAppSendInput,
  WhatsAppSendResult,
  assertWhatsAppSendInput,
  redactSecrets,
} from "./provider";

export type MetaWhatsAppConfig = {
  accessToken: string;
  phoneNumberId: string;
  /** Graph API version segment, e.g. `v21.0`. */
  apiVersion?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
};

type MetaMessagesResponse = {
  messaging_product?: string;
  messages?: Array<{ id?: string }>;
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
};

const DEFAULT_BASE_URL = "https://graph.facebook.com";
const DEFAULT_API_VERSION = "v21.0";

/** Strip spaces and a leading `+` so Meta receives digits-only MSISDNs. */
export function normalizeWhatsAppRecipient(to: string): string {
  return to.trim().replace(/^\+/, "").replace(/\s+/g, "");
}

export class MetaWhatsAppProvider implements WhatsAppProvider {
  readonly name = "meta";
  private readonly accessToken: string;
  private readonly phoneNumberId: string;
  private readonly apiVersion: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(config: MetaWhatsAppConfig) {
    if (!config.accessToken) {
      throw new Error("MetaWhatsAppProvider requires an accessToken");
    }
    if (!config.phoneNumberId) {
      throw new Error("MetaWhatsAppProvider requires a phoneNumberId");
    }
    this.accessToken = config.accessToken;
    this.phoneNumberId = config.phoneNumberId;
    this.apiVersion = (config.apiVersion ?? DEFAULT_API_VERSION).replace(/^\//, "");
    this.baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    this.fetchImpl = config.fetchImpl ?? globalThis.fetch;
    if (typeof this.fetchImpl !== "function") {
      throw new Error("MetaWhatsAppProvider requires a fetch implementation");
    }
  }

  private safeMessage(message: string): string {
    return redactSecrets(message, [this.accessToken]);
  }

  private messagesUrl(): string {
    return `${this.baseUrl}/${this.apiVersion}/${this.phoneNumberId}/messages`;
  }

  private buildPayload(input: WhatsAppSendInput): Record<string, unknown> {
    const to = normalizeWhatsAppRecipient(input.to);
    if (input.content.kind === "text") {
      return {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "text",
        text: { preview_url: false, body: input.content.body },
      };
    }
    const components =
      input.content.bodyParameters && input.content.bodyParameters.length > 0
        ? [
            {
              type: "body",
              parameters: input.content.bodyParameters.map((text) => ({
                type: "text",
                text,
              })),
            },
          ]
        : undefined;
    return {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "template",
      template: {
        name: input.content.name,
        language: { code: input.content.language },
        ...(components ? { components } : {}),
      },
    };
  }

  async send(input: WhatsAppSendInput): Promise<WhatsAppSendResult> {
    assertWhatsAppSendInput(this.name, input);

    const url = this.messagesUrl();
    const payload = this.buildPayload(input);

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      throw new WhatsAppProviderError(this.name, "Failed to reach Meta WhatsApp Cloud API", {
        cause: err,
      });
    }

    let parsed: MetaMessagesResponse | undefined;
    try {
      parsed = (await response.json()) as MetaMessagesResponse;
    } catch (err) {
      throw new WhatsAppProviderError(this.name, "Invalid JSON from Meta WhatsApp Cloud API", {
        status: response.status,
        cause: err,
      });
    }

    if (!response.ok) {
      const upstream = parsed?.error?.message ?? `Meta responded ${response.status}`;
      throw new WhatsAppProviderError(this.name, this.safeMessage(upstream), {
        status: response.status,
      });
    }

    const id = parsed?.messages?.[0]?.id ?? "";
    if (!id) {
      throw new WhatsAppProviderError(this.name, "Meta response missing message id", {
        status: response.status,
      });
    }

    return {
      provider: this.name,
      id,
      to: input.to,
      httpStatus: response.status,
    };
  }
}

export function metaWhatsAppFromEnv(
  env: NodeJS.ProcessEnv = process.env
): MetaWhatsAppProvider {
  const accessToken = env.WHATSAPP_ACCESS_TOKEN ?? env.META_WHATSAPP_ACCESS_TOKEN ?? "";
  const phoneNumberId = env.WHATSAPP_PHONE_NUMBER_ID ?? env.META_WHATSAPP_PHONE_NUMBER_ID ?? "";
  const apiVersion = env.WHATSAPP_API_VERSION ?? env.META_WHATSAPP_API_VERSION;
  const baseUrl = env.WHATSAPP_BASE_URL ?? env.META_WHATSAPP_BASE_URL;
  return new MetaWhatsAppProvider({ accessToken, phoneNumberId, apiVersion, baseUrl });
}
