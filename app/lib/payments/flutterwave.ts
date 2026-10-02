import {
  type CreatedSubaccount,
  type CreateSubaccountInput,
  type InitializedPayment,
  type InitializePaymentInput,
  type PaymentProvider,
  PaymentProviderError,
  type VerifiedPayment,
} from "./provider";

type Fetch = typeof fetch;

type FlutterwaveResponse<T> = {
  status: "success" | "error" | string;
  data?: T;
};

type FlutterwaveTransaction = {
  tx_ref: string;
  status: "successful" | "failed" | string;
  amount: number | string;
  currency: string;
  created_at?: string | null;
};

type FlutterwaveSubaccount = {
  subaccount_id: string;
  split_value: number | string;
};

/** Flutterwave amounts are expressed in whole currency units, unlike this port. */
function toFlutterwaveAmount(amountCents: number): number {
  return amountCents / 100;
}

/** Converts Flutterwave's currency-unit amount to this port's minor units. */
export function flutterwaveAmountToCents(amount: number | string): number {
  const cents = Math.round(Number(amount) * 100);
  if (!Number.isSafeInteger(cents) || cents < 0) {
    throw new PaymentProviderError("flutterwave", "Payment provider returned an invalid amount");
  }
  return cents;
}

/** Adapter for Flutterwave's hosted checkout, transaction, and split APIs. */
export class FlutterwavePaymentProvider implements PaymentProvider {
  readonly name = "flutterwave";

  constructor(
    private readonly apiKey: string,
    private readonly request: Fetch = fetch,
    private readonly apiUrl = "https://api.flutterwave.com/v3"
  ) {}

  async initialize(input: InitializePaymentInput): Promise<InitializedPayment> {
    const data = await this.post<{ link: string }>("/payments", {
      tx_ref: input.reference,
      amount: toFlutterwaveAmount(input.amountCents),
      currency: input.currency,
      redirect_url: input.callbackUrl,
      customer: { email: input.customerEmail },
      meta: input.metadata,
      ...(input.subaccountCode
        ? { subaccounts: [{ id: input.subaccountCode, transaction_split_ratio: 1 }] }
        : {}),
    });

    if (typeof data.link !== "string" || !isAbsoluteHttpUrl(data.link)) {
      throw new PaymentProviderError(this.name, "Payment provider returned an invalid response");
    }

    return { reference: input.reference, authorizationUrl: data.link };
  }

  async verify(reference: string): Promise<VerifiedPayment> {
    const data = await this.get<FlutterwaveTransaction>(
      `/transactions/verify_by_reference?tx_ref=${encodeURIComponent(reference)}`
    );
    if (!data.tx_ref || !data.currency) {
      throw new PaymentProviderError(this.name, "Payment provider returned an invalid response");
    }

    const paidAt = data.created_at ? new Date(data.created_at) : undefined;
    if (paidAt && Number.isNaN(paidAt.getTime())) {
      throw new PaymentProviderError(this.name, "Payment provider returned an invalid response");
    }

    return {
      reference: data.tx_ref,
      status:
        data.status === "successful"
          ? "succeeded"
          : data.status === "failed"
            ? "failed"
            : "pending",
      amountCents: flutterwaveAmountToCents(data.amount),
      currency: data.currency,
      ...(paidAt ? { paidAt } : {}),
    };
  }

  async createSubaccount(input: CreateSubaccountInput): Promise<CreatedSubaccount> {
    const data = await this.post<FlutterwaveSubaccount>("/subaccounts", {
      business_name: input.businessName,
      account_bank: input.settlementBank,
      account_number: input.accountNumber,
      split_type: "percentage",
      split_value: input.percentageCharge / 100,
    });
    const percentageCharge = Number(data.split_value) * 100;
    if (
      typeof data.subaccount_id !== "string" ||
      !data.subaccount_id ||
      !Number.isFinite(percentageCharge) ||
      percentageCharge < 0 ||
      percentageCharge > 100
    ) {
      throw new PaymentProviderError(this.name, "Payment provider returned an invalid response");
    }

    return { code: data.subaccount_id, percentageCharge };
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

function isAbsoluteHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}
