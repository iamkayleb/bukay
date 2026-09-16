import {
  PaymentProviderError,
  type PaymentInitializeInput,
  type PaymentInitializeResult,
  type PaymentProvider,
  type PaymentVerification,
  type SubaccountCreateInput,
  type SubaccountCreateResult,
} from "./provider";

type PaystackResponse = { status?: boolean; message?: string; data?: Record<string, unknown> };

export class PaystackPaymentProvider implements PaymentProvider {
  readonly name = "paystack";

  constructor(
    private readonly secretKey = process.env.PAYSTACK_SECRET_KEY,
    private readonly request = fetch
  ) {}

  async initialize(input: PaymentInitializeInput): Promise<PaymentInitializeResult> {
    const data = await this.post("/transaction/initialize", {
      email: input.customer.email,
      amount: input.amount,
      currency: input.currency,
      reference: input.reference,
      callback_url: input.callbackUrl,
      metadata: input.metadata,
      subaccount: input.subaccountCode,
    });
    const authorizationUrl = stringField(data, "authorization_url");
    const reference = stringField(data, "reference");
    return { provider: this.name, reference, authorizationUrl };
  }

  async verify(reference: string): Promise<PaymentVerification> {
    const data = await this.get(`/transaction/verify/${encodeURIComponent(reference)}`);
    const status = stringField(data, "status");
    return {
      provider: this.name,
      reference: stringField(data, "reference"),
      status: status === "success" ? "success" : status === "ongoing" ? "pending" : "failed",
      amount: numberField(data, "amount"),
      currency: stringField(data, "currency"),
      paidAt: dateField(data, "paid_at"),
    };
  }

  async createSubaccount(input: SubaccountCreateInput): Promise<SubaccountCreateResult> {
    const data = await this.post("/subaccount", {
      business_name: input.name,
      settlement_bank: input.settlementBank,
      account_number: input.accountNumber,
      percentage_charge: input.percentageCharge,
      currency: input.currency,
    });
    return {
      provider: this.name,
      code: stringField(data, "subaccount_code"),
      percentageCharge: numberField(data, "percentage_charge"),
    };
  }

  private async get(path: string): Promise<Record<string, unknown>> {
    return this.send(path, { method: "GET" });
  }

  private async post(
    path: string,
    body: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    return this.send(path, { method: "POST", body: JSON.stringify(body) });
  }

  private async send(path: string, init: RequestInit): Promise<Record<string, unknown>> {
    if (!this.secretKey) {
      throw new PaymentProviderError(this.name, "Payment provider is not configured");
    }
    try {
      const response = await this.request(`https://api.paystack.co${path}`, {
        ...init,
        headers: { Authorization: `Bearer ${this.secretKey}`, "Content-Type": "application/json" },
      });
      const body = (await response.json()) as PaystackResponse;
      if (!response.ok || !body.status || !body.data) {
        throw new PaymentProviderError(this.name, "Payment provider request failed", {
          status: response.status,
        });
      }
      return body.data;
    } catch (error) {
      if (error instanceof PaymentProviderError) throw error;
      throw new PaymentProviderError(this.name, "Payment provider request failed", {
        cause: error,
      });
    }
  }
}

function stringField(data: Record<string, unknown>, field: string): string {
  const value = data[field];
  if (typeof value !== "string" || !value) {
    throw new PaymentProviderError("paystack", "Payment provider returned invalid data");
  }
  return value;
}

function numberField(data: Record<string, unknown>, field: string): number {
  const value = data[field];
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new PaymentProviderError("paystack", "Payment provider returned invalid data");
  }
  return value;
}

function dateField(data: Record<string, unknown>, field: string): Date | null {
  const value = data[field];
  if (value == null) return null;
  if (typeof value !== "string") {
    throw new PaymentProviderError("paystack", "Payment provider returned invalid data");
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new PaymentProviderError("paystack", "Payment provider returned invalid data");
  }
  return date;
}
