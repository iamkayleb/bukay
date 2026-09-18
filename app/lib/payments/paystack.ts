import {
  type CreatedSubaccount,
  type CreateSubaccountInput,
  type InitializedPayment,
  type InitializePaymentInput,
  PaymentProviderError,
  type VerifiedPayment,
} from "./provider";

type Fetch = typeof fetch;

type PaystackResponse<T> = {
  status: boolean;
  data?: T;
};

type PaystackTransaction = {
  reference: string;
  status: "success" | "failed" | "abandoned" | string;
  amount: number;
  currency: string;
  paid_at?: string | null;
};

type PaystackSubaccount = {
  subaccount_code: string;
  percentage_charge: number;
};

/** Adapter for Paystack's transaction and subaccount APIs. */
export class PaystackPaymentProvider {
  readonly name = "paystack";

  constructor(
    private readonly apiKey: string,
    private readonly request: Fetch = fetch,
    private readonly apiUrl = "https://api.paystack.co"
  ) {}

  async initialize(input: InitializePaymentInput): Promise<InitializedPayment> {
    const data = await this.post<{ reference: string; authorization_url: string }>(
      "/transaction/initialize",
      {
        email: input.customerEmail,
        amount: input.amountCents,
        currency: input.currency,
        reference: input.reference,
        callback_url: input.callbackUrl,
        metadata: input.metadata,
        subaccount: input.subaccountCode,
      }
    );

    return { reference: data.reference, authorizationUrl: data.authorization_url };
  }

  async verify(reference: string): Promise<VerifiedPayment> {
    const data = await this.get<PaystackTransaction>(
      `/transaction/verify/${encodeURIComponent(reference)}`
    );
    return {
      reference: data.reference,
      status:
        data.status === "success" ? "succeeded" : data.status === "failed" ? "failed" : "pending",
      amountCents: data.amount,
      currency: data.currency,
      ...(data.paid_at ? { paidAt: new Date(data.paid_at) } : {}),
    };
  }

  async createSubaccount(input: CreateSubaccountInput): Promise<CreatedSubaccount> {
    const data = await this.post<PaystackSubaccount>("/subaccount", {
      business_name: input.businessName,
      settlement_bank: input.settlementBank,
      account_number: input.accountNumber,
      percentage_charge: input.percentageCharge,
    });
    return { code: data.subaccount_code, percentageCharge: data.percentage_charge };
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

    const payload = (await response.json()) as PaystackResponse<T>;
    if (!payload.status || !payload.data) {
      throw new PaymentProviderError(this.name, "Payment provider returned an invalid response");
    }
    return payload.data;
  }
}
