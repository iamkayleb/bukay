import { SmsMessage, SmsProvider, SmsProviderError, SmsSendResult } from "./provider";

export type TermiiConfig = {
  apiKey: string;
  senderId: string;
  baseUrl?: string;
  channel?: "generic" | "dnd" | "whatsapp";
  fetchImpl?: typeof fetch;
};

type TermiiSendResponse = {
  message_id?: string;
  code?: string;
  message?: string;
};

const DEFAULT_BASE_URL = "https://api.ng.termii.com";

export class TermiiProvider implements SmsProvider {
  readonly name = "termii";
  private readonly apiKey: string;
  private readonly senderId: string;
  private readonly baseUrl: string;
  private readonly channel: NonNullable<TermiiConfig["channel"]>;
  private readonly fetchImpl: typeof fetch;

  constructor(config: TermiiConfig) {
    if (!config.apiKey) {
      throw new Error("TermiiProvider requires an apiKey");
    }
    if (!config.senderId) {
      throw new Error("TermiiProvider requires a senderId");
    }
    this.apiKey = config.apiKey;
    this.senderId = config.senderId;
    this.baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    this.channel = config.channel ?? "generic";
    this.fetchImpl = config.fetchImpl ?? globalThis.fetch;
    if (typeof this.fetchImpl !== "function") {
      throw new Error("TermiiProvider requires a fetch implementation");
    }
  }

  async send(message: SmsMessage): Promise<SmsSendResult> {
    if (!message.to) throw new SmsProviderError(this.name, "SMS 'to' is required");
    if (!message.body) throw new SmsProviderError(this.name, "SMS 'body' is required");

    const url = `${this.baseUrl}/api/sms/send`;
    const payload = {
      to: message.to,
      from: this.senderId,
      sms: message.body,
      type: "plain",
      channel: this.channel,
      api_key: this.apiKey,
    };

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      throw new SmsProviderError(this.name, "Failed to reach Termii", { cause: err });
    }

    let parsed: TermiiSendResponse | undefined;
    try {
      parsed = (await response.json()) as TermiiSendResponse;
    } catch (err) {
      throw new SmsProviderError(this.name, "Invalid JSON from Termii", {
        status: response.status,
        cause: err,
      });
    }

    if (!response.ok) {
      throw new SmsProviderError(
        this.name,
        parsed?.message ?? `Termii responded ${response.status}`,
        { status: response.status }
      );
    }

    const id = parsed?.message_id ?? parsed?.code ?? "";
    if (!id) {
      throw new SmsProviderError(this.name, "Termii response missing message_id", {
        status: response.status,
      });
    }

    return { id, provider: this.name, to: message.to };
  }
}

export function termiiFromEnv(env: NodeJS.ProcessEnv = process.env): TermiiProvider {
  const apiKey = env.TERMII_API_KEY ?? "";
  const senderId = env.TERMII_SENDER_ID ?? "";
  const baseUrl = env.TERMII_BASE_URL;
  const channel = env.TERMII_CHANNEL as TermiiConfig["channel"] | undefined;
  return new TermiiProvider({ apiKey, senderId, baseUrl, channel });
}
