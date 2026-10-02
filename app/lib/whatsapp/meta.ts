import {
  WhatsAppProvider,
  WhatsAppProviderError,
  WhatsAppSendResult,
  WhatsAppTemplateMessage,
} from "./provider";
import { getTemplate, renderTemplateParams } from "./templates";

export type MetaWhatsAppConfig = {
  accessToken: string;
  phoneNumberId: string;
  baseUrl?: string;
  apiVersion?: string;
  fetchImpl?: typeof fetch;
};

type MetaSendResponse = {
  messages?: { id?: string }[];
  error?: { message?: string };
};

const DEFAULT_BASE_URL = "https://graph.facebook.com";
const DEFAULT_API_VERSION = "v20.0";

export class MetaWhatsAppProvider implements WhatsAppProvider {
  readonly name = "meta";
  private readonly accessToken: string;
  private readonly phoneNumberId: string;
  private readonly baseUrl: string;
  private readonly apiVersion: string;
  private readonly fetchImpl: typeof fetch;

  constructor(config: MetaWhatsAppConfig) {
    if (!config.accessToken) throw new Error("MetaWhatsAppProvider requires an accessToken");
    if (!config.phoneNumberId) throw new Error("MetaWhatsAppProvider requires a phoneNumberId");
    this.accessToken = config.accessToken;
    this.phoneNumberId = config.phoneNumberId;
    this.baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    this.apiVersion = config.apiVersion ?? DEFAULT_API_VERSION;
    this.fetchImpl = config.fetchImpl ?? globalThis.fetch;
    if (typeof this.fetchImpl !== "function") {
      throw new Error("MetaWhatsAppProvider requires a fetch implementation");
    }
  }

  async sendTemplate(message: WhatsAppTemplateMessage): Promise<WhatsAppSendResult> {
    if (!message.to) throw new WhatsAppProviderError(this.name, "WhatsApp 'to' is required");
    const template = getTemplate(message.template);
    if (!template) {
      throw new WhatsAppProviderError(this.name, `Unknown template '${message.template}'`);
    }

    let values: string[];
    try {
      values = renderTemplateParams(template, message.params);
    } catch (err) {
      throw new WhatsAppProviderError(this.name, (err as Error).message, { cause: err });
    }

    const url = `${this.baseUrl}/${this.apiVersion}/${this.phoneNumberId}/messages`;
    const payload = {
      messaging_product: "whatsapp",
      to: message.to.replace(/^\+/, ""),
      type: "template",
      template: {
        name: template.name,
        language: { code: template.language },
        components: [
          {
            type: "body",
            parameters: values.map((text) => ({ type: "text", text })),
          },
        ],
      },
    };

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.accessToken}`,
        },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      throw new WhatsAppProviderError(this.name, "Failed to reach Meta", { cause: err });
    }

    let parsed: MetaSendResponse | undefined;
    try {
      parsed = (await response.json()) as MetaSendResponse;
    } catch (err) {
      throw new WhatsAppProviderError(this.name, "Invalid JSON from Meta", {
        status: response.status,
        cause: err,
      });
    }

    if (!response.ok) {
      throw new WhatsAppProviderError(
        this.name,
        parsed?.error?.message ?? `Meta responded ${response.status}`,
        { status: response.status }
      );
    }

    const id = parsed?.messages?.[0]?.id ?? "";
    if (!id) {
      throw new WhatsAppProviderError(this.name, "Meta response missing message id", {
        status: response.status,
      });
    }

    return { id, provider: this.name, to: message.to, status: response.status };
  }
}

export function metaWhatsAppFromEnv(env: NodeJS.ProcessEnv = process.env): MetaWhatsAppProvider {
  return new MetaWhatsAppProvider({
    accessToken: env.WHATSAPP_ACCESS_TOKEN ?? "",
    phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID ?? "",
    baseUrl: env.WHATSAPP_BASE_URL,
    apiVersion: env.WHATSAPP_API_VERSION,
  });
}
