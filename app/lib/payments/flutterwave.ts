import {
  type CreatedSubaccount,
  type CreateSubaccountInput,
  type InitializedPayment,
  type InitializePaymentInput,
  PaymentProviderError,
  type PaymentProvider,
  type VerifiedPayment,
} from "./provider";

type Fetch = typeof fetch;

type FlutterwaveResponse<T> = {
  status: "success" | "error" | string;
  data?: T;
};

type FlutterwaveTransaction = {
  tx_ref: string;
  status: "successful" | "failed" | "pending" | string;
  amount: number | string;
  currency: string;
  created_at?: string | null;
  paid_at?: string | null;
};

type FlutterwaveSubaccount = {
  subaccount_id: string;
  split_value: number;
};

/** Adapter for Flutterwave's hosted checkout, verification, and split-payment APIs. */
export class FlutterwavePaymentProvider implements PaymentProvider {
  readonly name = "flutterwave";

  constructor(
    private readonly apiKey: string,
    private readonly request: Fetch = fetch,
    private readonly apiUrl = "https://api.flutterwave.com/v3"
  ) {}

  async initialize(input: InitializePaymentInput): Promise<InitializedPayment> {
    const data = await this.post<{ tx_ref: string; link: string }>("/payments", {
      tx_ref: input.reference,
      amount: fromMinorUnits(input.amountCents, input.currency),
      currency: input.currency,
      redirect_url: input.callbackUrl,
      customer: { email: input.customerEmail },
      meta: input.metadata,
      ...(input.subaccountCode
        ? {
            subaccounts: [
              {
                id: input.subaccountCode,
                transaction_split_ratio: input.subaccountPercentage ?? 100,
              },
            ],
          }
        : {}),
    });

    return { reference: data.tx_ref, authorizationUrl: data.link };
  }

  async verify(reference: string): Promise<VerifiedPayment> {
    const params = new URLSearchParams({ tx_ref: reference });
    const data = await this.get<FlutterwaveTransaction>(
      `/transactions/verify_by_reference?${params}`
    );
    return {
      reference: data.tx_ref,
      status:
        data.status === "successful"
          ? "succeeded"
          : data.status === "failed"
            ? "failed"
            : "pending",
      amountCents: toMinorUnits(data.amount, data.currency),
      currency: data.currency,
      ...((data.paid_at ?? data.created_at)
        ? { paidAt: new Date(data.paid_at ?? data.created_at!) }
        : {}),
    };
  }

  async createSubaccount(input: CreateSubaccountInput): Promise<CreatedSubaccount> {
    const data = await this.post<FlutterwaveSubaccount>("/subaccounts", {
      account_bank: input.settlementBank,
      account_number: input.accountNumber,
      business_name: input.businessName,
      country: input.country ?? "NG",
      business_mobile: input.businessMobile,
      split_type: "percentage",
      split_value: input.percentageCharge / 100,
    });
    return { code: data.subaccount_id, percentageCharge: data.split_value * 100 };
  }

  private async get<T>(path: string): Promise<T> {
    return this.send<T>(path, { method: "GET" });
  }

  private async post<T>(path: string, body: Record<string, unknown>): Promise<T> {
    return this.send<T>(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        Object.fromEntries(Object.entries(body).filter(([, value]) => value !== undefined))
      ),
    });
  }

  private async send<T>(path: string, init: RequestInit): Promise<T> {
    let response: Response;
    try {
      response = await this.request(`${this.apiUrl}${path}`, {
        ...init,
        headers: { ...init.headers, authorization: `Bearer ${this.apiKey}` },
      });
    } catch {
      throw new PaymentProviderError(this.name, "Payment provider request failed");
    }

    if (!response.ok) {
      throw new PaymentProviderError(this.name, "Payment provider request was rejected", {
        status: response.status,
      });
    }

    const payload = (await response.json()) as FlutterwaveResponse<T>;
    if (payload.status !== "success" || !payload.data) {
      throw new PaymentProviderError(this.name, "Payment provider returned an invalid response");
    }
    return payload.data;
  }
}

function fractionDigits(currency: string) {
  return (
    new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions()
      .maximumFractionDigits ?? 2
  );
}

function fromMinorUnits(amountCents: number, currency: string) {
  const divisor = 10 ** fractionDigits(currency);
  return amountCents / divisor;
}

function toMinorUnits(amount: number | string, currency: string) {
  const value = Number(amount);
  const multiplier = 10 ** fractionDigits(currency);
  const minorAmount = Math.round(value * multiplier);
  if (!Number.isFinite(value) || !Number.isSafeInteger(minorAmount)) {
    throw new PaymentProviderError("flutterwave", "Payment provider returned an invalid amount");
  }
  return minorAmount;
}
