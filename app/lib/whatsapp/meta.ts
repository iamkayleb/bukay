import {
  type SendWhatsAppTemplateInput,
  type WhatsAppProvider,
  WhatsAppProviderError,
  type WhatsAppSendResult,
} from "./provider";

const DEFAULT_GRAPH_API_URL = "https://graph.facebook.com";
const DEFAULT_GRAPH_API_VERSION = "v21.0";

export type MetaWhatsAppConfig = {
  accessToken: string;
  phoneNumberId: string;
  graphApiUrl?: string;
  graphApiVersion?: string;
  defaultLanguage?: string;
  fetchImpl?: typeof fetch;
};

type MetaSendResponse = {
  messages?: Array<{ id?: string }>;
  error?: { message?: string };
};

/** Sends approved templates through the Meta WhatsApp Cloud API. */
export class MetaWhatsAppProvider implements WhatsAppProvider {
  readonly name = "meta";
  private readonly accessToken: string;
  private readonly phoneNumberId: string;
  private readonly graphApiUrl: string;
  private readonly graphApiVersion: string;
  private readonly defaultLanguage: string;
  private readonly fetchImpl: typeof fetch;

  constructor(config: MetaWhatsAppConfig) {
    if (!config.accessToken) throw new Error("MetaWhatsAppProvider requires an accessToken");
    if (!config.phoneNumberId) throw new Error("MetaWhatsAppProvider requires a phoneNumberId");

    this.accessToken = config.accessToken;
    this.phoneNumberId = config.phoneNumberId;
    this.graphApiUrl = (config.graphApiUrl ?? DEFAULT_GRAPH_API_URL).replace(/\/$/, "");
    this.graphApiVersion = config.graphApiVersion ?? DEFAULT_GRAPH_API_VERSION;
    this.defaultLanguage = config.defaultLanguage ?? "en_US";
    this.fetchImpl = config.fetchImpl ?? globalThis.fetch;
    if (typeof this.fetchImpl !== "function") {
      throw new Error("MetaWhatsAppProvider requires a fetch implementation");
    }
  }

  async sendTemplate(input: SendWhatsAppTemplateInput): Promise<WhatsAppSendResult> {
    if (!input.to) throw new WhatsAppProviderError(this.name, "WhatsApp 'to' is required");
    if (!input.template) {
      throw new WhatsAppProviderError(this.name, "WhatsApp template name is required");
    }

    const components = input.parameters.length
      ? [
          {
            type: "body",
            parameters: input.parameters.map((text) => ({ type: "text", text })),
          },
        ]
      : undefined;
    const body = {
      messaging_product: "whatsapp",
      to: input.to.replace(/^\+/, ""),
      type: "template",
      template: {
        name: input.template,
        language: { code: input.language ?? this.defaultLanguage },
        ...(components ? { components } : {}),
      },
    };

    let response: Response;
    try {
      response = await this.fetchImpl(this.endpoint(), {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      });
    } catch (cause) {
      throw new WhatsAppProviderError(this.name, "Failed to reach Meta Cloud API", {
        retryable: true,
        cause,
      });
    }

    const payload = await this.parseResponse(response);
    if (!response.ok) {
      throw new WhatsAppProviderError(
        this.name,
        payload?.error?.message ?? `Meta Cloud API responded ${response.status}`,
        { status: response.status, retryable: isRetryableStatus(response.status) }
      );
    }

    const id = payload?.messages?.[0]?.id;
    if (!id) {
      throw new WhatsAppProviderError(this.name, "Meta Cloud API response missing message id", {
        status: response.status,
      });
    }

    return { id, provider: this.name, to: input.to };
  }

  private endpoint(): string {
    return `${this.graphApiUrl}/${this.graphApiVersion}/${encodeURIComponent(this.phoneNumberId)}/messages`;
  }

  private async parseResponse(response: Response): Promise<MetaSendResponse | undefined> {
    try {
      return (await response.json()) as MetaSendResponse;
    } catch (cause) {
      if (response.ok) {
        throw new WhatsAppProviderError(this.name, "Invalid JSON from Meta Cloud API", {
          status: response.status,
          cause,
        });
      }
      return undefined;
    }
  }
}

/** Backwards-compatible descriptive name for the Meta Cloud API adapter. */
export { MetaWhatsAppProvider as MetaCloudApiProvider };

export function metaWhatsAppFromEnv(env: NodeJS.ProcessEnv = process.env): MetaWhatsAppProvider {
  return new MetaWhatsAppProvider({
    accessToken: env.META_WHATSAPP_ACCESS_TOKEN ?? "",
    phoneNumberId: env.META_WHATSAPP_PHONE_NUMBER_ID ?? "",
    graphApiUrl: env.META_GRAPH_API_URL,
    graphApiVersion: env.META_GRAPH_API_VERSION,
    defaultLanguage: env.META_WHATSAPP_DEFAULT_LANGUAGE,
  });
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}
