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

export type FlutterwaveConfig = {
  secretKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
};

type FlutterwaveInitializeData = {
  link?: string;
};

type FlutterwaveVerifyData = {
  status?: string;
  tx_ref?: string;
  amount?: number;
  charged_amount?: number;
  currency?: string;
  created_at?: string | null;
  meta?: Record<string, unknown> | null;
  /** Split subaccount id when present on the charge. */
  subaccounts?: Array<{ id?: string } | string> | null;
};

type FlutterwaveEnvelope<T> = {
  status?: string;
  message?: string;
  data?: T;
};

const DEFAULT_BASE_URL = "https://api.flutterwave.com/v3";

/**
 * Flutterwave Standard expects major currency units (e.g. NGN naira), while the
 * PaymentProvider port always speaks integer minor units (kobo/cents).
 */
export function minorUnitsToFlutterwaveAmount(amountCents: number): number {
  return Math.trunc(amountCents) / 100;
}

export function flutterwaveAmountToMinorUnits(amount: number): number {
  return Math.round(Number(amount) * 100);
}

function mapVerifyStatus(raw: string | undefined): PaymentVerificationStatus {
  switch ((raw ?? "").toLowerCase()) {
    case "successful":
    case "success":
      return "success";
    case "failed":
      return "failed";
    case "abandoned":
    case "cancelled":
    case "canceled":
      return "abandoned";
    default:
      return "pending";
  }
}

function accessCodeFromLink(link: string, reference: string): string {
  const trimmed = link.replace(/\/$/, "");
  const segment = trimmed.split("/").pop();
  return segment && segment.length > 0 ? segment : `flw_${reference}`;
}

function subaccountFromVerify(data: FlutterwaveVerifyData): string | null {
  const list = data.subaccounts;
  if (!Array.isArray(list) || list.length === 0) return null;
  const first = list[0];
  if (typeof first === "string") return first;
  if (first && typeof first === "object" && typeof first.id === "string") return first.id;
  return null;
}

export class FlutterwaveProvider implements PaymentProvider {
  readonly name = "flutterwave";
  private readonly secretKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(config: FlutterwaveConfig) {
    if (!config.secretKey) {
      throw new Error("FlutterwaveProvider requires a secretKey");
    }
    this.secretKey = config.secretKey;
    this.baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    this.fetchImpl = config.fetchImpl ?? globalThis.fetch;
    if (typeof this.fetchImpl !== "function") {
      throw new Error("FlutterwaveProvider requires a fetch implementation");
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

    const meta: Record<string, unknown> = {
      ...(input.metadata ?? {}),
    };
    if (
      input.platformSplitPercentage !== undefined &&
      Number.isFinite(input.platformSplitPercentage)
    ) {
      meta.platform_split_percentage = input.platformSplitPercentage;
    }

    const payload: Record<string, unknown> = {
      tx_ref: input.reference,
      amount: minorUnitsToFlutterwaveAmount(input.amountCents),
      currency: input.currency,
      redirect_url: input.callbackUrl,
      customer: {
        email: input.email,
      },
    };
    if (Object.keys(meta).length > 0) {
      payload.meta = meta;
    }
    if (input.subaccountCode) {
      const subaccount: Record<string, unknown> = { id: input.subaccountCode };
      if (
        input.platformSplitPercentage !== undefined &&
        Number.isFinite(input.platformSplitPercentage)
      ) {
        // Platform share retained by the main account (mirrors Paystack percentage_charge).
        subaccount.transaction_charge_type = "percentage";
        subaccount.transaction_charge = input.platformSplitPercentage;
      }
      payload.subaccounts = [subaccount];
    }

    const url = `${this.baseUrl}/payments`;
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: "POST",
        headers: this.authHeaders(),
        body: JSON.stringify(payload),
      });
    } catch (err) {
      throw new PaymentProviderError(this.name, this.safeMessage("Failed to reach Flutterwave"), {
        cause: err,
      });
    }

    let parsed: FlutterwaveEnvelope<FlutterwaveInitializeData> | undefined;
    try {
      parsed = (await response.json()) as FlutterwaveEnvelope<FlutterwaveInitializeData>;
    } catch (err) {
      throw new PaymentProviderError(this.name, this.safeMessage("Invalid JSON from Flutterwave"), {
        status: response.status,
        cause: err,
      });
    }

    const okStatus =
      typeof parsed?.status === "string" && parsed.status.toLowerCase() === "success";
    if (!response.ok || !okStatus) {
      throw new PaymentProviderError(
        this.name,
        this.safeMessage(parsed?.message ?? `Flutterwave responded ${response.status}`),
        { status: response.status }
      );
    }

    const authorizationUrl = parsed.data?.link;
    if (!authorizationUrl) {
      throw new PaymentProviderError(
        this.name,
        this.safeMessage("Flutterwave initialize response missing data.link"),
        { status: response.status }
      );
    }

    return {
      provider: this.name,
      reference: input.reference,
      authorizationUrl,
      accessCode: accessCodeFromLink(authorizationUrl, input.reference),
    };
  }

  async verify(input: VerifyPaymentInput): Promise<VerifyPaymentResult> {
    assertVerifyPaymentInput(this.name, input);

    const url = `${this.baseUrl}/transactions/verify_by_reference?tx_ref=${encodeURIComponent(input.reference)}`;
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: "GET",
        headers: this.authHeaders(),
      });
    } catch (err) {
      throw new PaymentProviderError(this.name, this.safeMessage("Failed to reach Flutterwave"), {
        cause: err,
      });
    }

    let parsed: FlutterwaveEnvelope<FlutterwaveVerifyData> | undefined;
    try {
      parsed = (await response.json()) as FlutterwaveEnvelope<FlutterwaveVerifyData>;
    } catch (err) {
      throw new PaymentProviderError(this.name, this.safeMessage("Invalid JSON from Flutterwave"), {
        status: response.status,
        cause: err,
      });
    }

    const okStatus =
      typeof parsed?.status === "string" && parsed.status.toLowerCase() === "success";
    if (!response.ok || !okStatus || !parsed.data) {
      throw new PaymentProviderError(
        this.name,
        this.safeMessage(parsed?.message ?? `Flutterwave responded ${response.status}`),
        { status: response.status }
      );
    }

    const data = parsed.data;
    const providerStatus = data.status ?? "pending";
    const paidAtRaw = data.created_at;
    const paidAt = paidAtRaw ? new Date(paidAtRaw) : null;
    const meta = data.meta ?? {};
    const splitRaw = meta.platform_split_percentage;
    const platformSplitPercentage =
      typeof splitRaw === "number"
        ? splitRaw
        : typeof splitRaw === "string" && splitRaw.trim() !== ""
          ? Number(splitRaw)
          : null;

    const majorAmount = data.charged_amount ?? data.amount ?? 0;

    return {
      provider: this.name,
      reference: data.tx_ref ?? input.reference,
      status: mapVerifyStatus(providerStatus),
      amountCents: flutterwaveAmountToMinorUnits(majorAmount),
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

export function flutterwaveFromEnv(env: NodeJS.ProcessEnv = process.env): FlutterwaveProvider {
  const secretKey = env.FLUTTERWAVE_SECRET_KEY ?? env.FLW_SECRET_KEY ?? "";
  const baseUrl = env.FLUTTERWAVE_BASE_URL ?? env.FLW_BASE_URL;
  return new FlutterwaveProvider({ secretKey, baseUrl });
}
