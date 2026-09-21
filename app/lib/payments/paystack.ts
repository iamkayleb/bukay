import {
  InitializePaymentInput,
  InitializePaymentResult,
  PaymentProvider,
  PaymentProviderError,
  PaymentVerificationStatus,
  VerifyPaymentInput,
  VerifyPaymentResult,
  assertInitializePaymentInput,
  assertVerifyPaymentInput,
  redactSecrets,
} from "./provider";

export type PaystackConfig = {
  secretKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
};

type PaystackInitializeData = {
  authorization_url?: string;
  access_code?: string;
  reference?: string;
};

type PaystackVerifyData = {
  status?: string;
  reference?: string;
  amount?: number;
  currency?: string;
  paid_at?: string | null;
  subaccount?: string | { subaccount_code?: string } | null;
  metadata?: Record<string, unknown> | null;
};

type PaystackEnvelope<T> = {
  status?: boolean;
  message?: string;
  data?: T;
};

const DEFAULT_BASE_URL = "https://api.paystack.co";

function mapVerifyStatus(raw: string | undefined): PaymentVerificationStatus {
  switch ((raw ?? "").toLowerCase()) {
    case "success":
      return "success";
    case "failed":
      return "failed";
    case "abandoned":
      return "abandoned";
    default:
      return "pending";
  }
}

function subaccountFromVerify(data: PaystackVerifyData): string | null {
  if (!data.subaccount) return null;
  if (typeof data.subaccount === "string") return data.subaccount;
  return data.subaccount.subaccount_code ?? null;
}

export class PaystackProvider implements PaymentProvider {
  readonly name = "paystack";
  private readonly secretKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(config: PaystackConfig) {
    if (!config.secretKey) {
      throw new Error("PaystackProvider requires a secretKey");
    }
    this.secretKey = config.secretKey;
    this.baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    this.fetchImpl = config.fetchImpl ?? globalThis.fetch;
    if (typeof this.fetchImpl !== "function") {
      throw new Error("PaystackProvider requires a fetch implementation");
    }
  }

  private safeMessage(message: string): string {
    return redactSecrets(message, [this.secretKey]);
  }

  private authHeaders(): HeadersInit {
    return {
      Authorization: `Bearer ${this.secretKey}`,
      "Content-Type": "application/json",
    };
  }

  async initialize(input: InitializePaymentInput): Promise<InitializePaymentResult> {
    assertInitializePaymentInput(this.name, input);

    const payload: Record<string, unknown> = {
      email: input.email,
      amount: Math.trunc(input.amountCents),
      currency: input.currency,
      reference: input.reference,
      callback_url: input.callbackUrl,
    };
    if (input.metadata) {
      payload.metadata = input.metadata;
    }
    if (input.subaccountCode) {
      payload.subaccount = input.subaccountCode;
    }
    if (
      input.platformSplitPercentage !== undefined &&
      Number.isFinite(input.platformSplitPercentage)
    ) {
      // Stored on metadata so verify/tests can assert the configured split.
      payload.metadata = {
        ...(typeof payload.metadata === "object" && payload.metadata
          ? (payload.metadata as Record<string, unknown>)
          : {}),
        platform_split_percentage: input.platformSplitPercentage,
      };
    }

    const url = `${this.baseUrl}/transaction/initialize`;
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: "POST",
        headers: this.authHeaders(),
        body: JSON.stringify(payload),
      });
    } catch (err) {
      throw new PaymentProviderError(this.name, this.safeMessage("Failed to reach Paystack"), {
        cause: err,
      });
    }

    let parsed: PaystackEnvelope<PaystackInitializeData> | undefined;
    try {
      parsed = (await response.json()) as PaystackEnvelope<PaystackInitializeData>;
    } catch (err) {
      throw new PaymentProviderError(this.name, this.safeMessage("Invalid JSON from Paystack"), {
        status: response.status,
        cause: err,
      });
    }

    if (!response.ok || !parsed?.status) {
      throw new PaymentProviderError(
        this.name,
        this.safeMessage(parsed?.message ?? `Paystack responded ${response.status}`),
        { status: response.status }
      );
    }

    const authorizationUrl = parsed.data?.authorization_url;
    const accessCode = parsed.data?.access_code;
    const reference = parsed.data?.reference ?? input.reference;
    if (!authorizationUrl || !accessCode) {
      throw new PaymentProviderError(
        this.name,
        this.safeMessage("Paystack initialize response missing authorization_url or access_code"),
        { status: response.status }
      );
    }

    return {
      provider: this.name,
      reference,
      authorizationUrl,
      accessCode,
    };
  }

  async verify(input: VerifyPaymentInput): Promise<VerifyPaymentResult> {
    assertVerifyPaymentInput(this.name, input);

    const url = `${this.baseUrl}/transaction/verify/${encodeURIComponent(input.reference)}`;
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: "GET",
        headers: this.authHeaders(),
      });
    } catch (err) {
      throw new PaymentProviderError(this.name, this.safeMessage("Failed to reach Paystack"), {
        cause: err,
      });
    }

    let parsed: PaystackEnvelope<PaystackVerifyData> | undefined;
    try {
      parsed = (await response.json()) as PaystackEnvelope<PaystackVerifyData>;
    } catch (err) {
      throw new PaymentProviderError(this.name, this.safeMessage("Invalid JSON from Paystack"), {
        status: response.status,
        cause: err,
      });
    }

    if (!response.ok || !parsed?.status || !parsed.data) {
      throw new PaymentProviderError(
        this.name,
        this.safeMessage(parsed?.message ?? `Paystack responded ${response.status}`),
        { status: response.status }
      );
    }

    const data = parsed.data;
    const providerStatus = data.status ?? "pending";
    const paidAtRaw = data.paid_at;
    const paidAt = paidAtRaw ? new Date(paidAtRaw) : null;
    const meta = data.metadata ?? {};
    const splitRaw = meta.platform_split_percentage;
    const platformSplitPercentage =
      typeof splitRaw === "number"
        ? splitRaw
        : typeof splitRaw === "string" && splitRaw.trim() !== ""
          ? Number(splitRaw)
          : null;

    return {
      provider: this.name,
      reference: data.reference ?? input.reference,
      status: mapVerifyStatus(providerStatus),
      amountCents: Math.trunc(data.amount ?? 0),
      currency: data.currency ?? "NGN",
      paidAt: paidAt && !Number.isNaN(paidAt.getTime()) ? paidAt : null,
      providerStatus,
      subaccountCode: subaccountFromVerify(data),
      platformSplitPercentage:
        platformSplitPercentage !== null && Number.isFinite(platformSplitPercentage)
          ? platformSplitPercentage
          : null,
    };
  }
}

export function paystackFromEnv(env: NodeJS.ProcessEnv = process.env): PaystackProvider {
  const secretKey = env.PAYSTACK_SECRET_KEY ?? "";
  const baseUrl = env.PAYSTACK_BASE_URL;
  return new PaystackProvider({ secretKey, baseUrl });
}
