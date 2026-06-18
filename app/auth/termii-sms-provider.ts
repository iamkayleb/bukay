import {
  SmsDeliveryReceipt,
  SmsMessage,
  SmsProvider,
  SmsProviderError,
} from "@/app/auth/sms-provider";

type Fetch = typeof fetch;

type TermiiChannel = "dnd" | "generic" | "whatsapp" | "voice";

interface TermiiSmsProviderOptions {
  apiKey: string;
  senderId: string;
  baseUrl?: string;
  channel?: TermiiChannel;
  fetchImpl?: Fetch;
}

interface TermiiSendResponse {
  code?: string;
  message?: string;
  message_id?: string;
  message_id_str?: string;
}

const PROVIDER = "termii";
const DEFAULT_BASE_URL = "https://api.ng.termii.com";
const DEFAULT_CHANNEL: TermiiChannel = "dnd";

export class TermiiSmsProvider implements SmsProvider {
  private readonly apiKey: string;
  private readonly senderId: string;
  private readonly baseUrl: string;
  private readonly channel: TermiiChannel;
  private readonly fetchImpl: Fetch;

  constructor(options: TermiiSmsProviderOptions) {
    this.apiKey = requireNonEmpty(options.apiKey, "Termii API key");
    this.senderId = requireNonEmpty(options.senderId, "Termii sender ID");
    this.baseUrl = normalizeBaseUrl(options.baseUrl ?? DEFAULT_BASE_URL);
    this.channel = options.channel ?? DEFAULT_CHANNEL;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async sendSms(message: SmsMessage): Promise<SmsDeliveryReceipt> {
    const response = await this.fetchImpl(`${this.baseUrl}/api/sms/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        api_key: this.apiKey,
        to: formatTermiiRecipient(message.to),
        from: this.senderId,
        sms: message.body,
        type: "plain",
        channel: this.channel,
      }),
    });

    const result = await parseTermiiResponse(response);

    if (!response.ok || result.code !== "ok") {
      throw new SmsProviderError(
        result.message || `Termii SMS request failed with status ${response.status}`,
        PROVIDER,
        response.status
      );
    }

    return {
      provider: PROVIDER,
      messageId: result.message_id_str ?? result.message_id,
    };
  }
}

export function createTermiiSmsProviderFromEnv(
  env: Record<string, string | undefined> = process.env,
  fetchImpl?: Fetch
): TermiiSmsProvider {
  return new TermiiSmsProvider({
    apiKey: env.TERMII_API_KEY ?? "",
    senderId: env.TERMII_SENDER_ID ?? "",
    baseUrl: env.TERMII_BASE_URL,
    channel: parseTermiiChannel(env.TERMII_CHANNEL),
    fetchImpl,
  });
}

function formatTermiiRecipient(phoneNumber: string): string {
  return phoneNumber.trim().replace(/^\+/, "");
}

function parseTermiiChannel(channel: string | undefined): TermiiChannel | undefined {
  if (!channel) {
    return undefined;
  }

  if (channel === "dnd" || channel === "generic" || channel === "whatsapp" || channel === "voice") {
    return channel;
  }

  throw new SmsProviderError(`Unsupported Termii channel: ${channel}`, PROVIDER);
}

async function parseTermiiResponse(response: Response): Promise<TermiiSendResponse> {
  try {
    return (await response.json()) as TermiiSendResponse;
  } catch {
    return {};
  }
}

function normalizeBaseUrl(baseUrl: string): string {
  const trimmed = requireNonEmpty(baseUrl, "Termii base URL");
  return trimmed.replace(/\/+$/, "");
}

function requireNonEmpty(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new SmsProviderError(`${label} is required`, PROVIDER);
  }
  return trimmed;
}
