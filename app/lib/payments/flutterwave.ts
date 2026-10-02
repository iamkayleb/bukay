import {
  PaymentProviderError,
  type PaymentInitializeInput,
  type PaymentInitializeResult,
  type PaymentProvider,
  type PaymentVerification,
  type SubaccountCreateInput,
  type SubaccountCreateResult,
} from "./provider";

type FlutterwaveResponse = { status?: string; message?: string; data?: Record<string, unknown> };

const PROVIDER = "flutterwave";

// The port speaks the currency's smallest unit; Flutterwave speaks major units.
const toMajor = (minor: number) => minor / 100;
const toMinor = (major: number) => Math.round(major * 100);

export class FlutterwavePaymentProvider implements PaymentProvider {
  readonly name = PROVIDER;

  constructor(
    private readonly secretKey = process.env.FLUTTERWAVE_SECRET_KEY,
    private readonly request = fetch
  ) {}

  async initialize(input: PaymentInitializeInput): Promise<PaymentInitializeResult> {
    const data = await this.send("/payments", {
      method: "POST",
      body: JSON.stringify({
        tx_ref: input.reference,
        amount: toMajor(input.amount),
        currency: input.currency,
        redirect_url: input.callbackUrl,
        customer: {
          email: input.customer.email,
          name: input.customer.name,
          phonenumber: input.customer.phone,
        },
        meta: input.metadata,
        subaccounts: input.subaccountCode ? [{ id: input.subaccountCode }] : undefined,
      }),
    });
    return {
      provider: this.name,
      reference: input.reference,
      authorizationUrl: stringField(data, "link"),
    };
  }

  async verify(reference: string): Promise<PaymentVerification> {
    const data = await this.send(
      `/transactions/verify_by_reference?tx_ref=${encodeURIComponent(reference)}`,
      { method: "GET" }
    );
    const status = stringField(data, "status");
    return {
      provider: this.name,
      reference: stringField(data, "tx_ref"),
      status:
        status === "successful" || status === "success"
          ? "success"
          : status === "pending"
            ? "pending"
            : "failed",
      amount: toMinor(numberField(data, "amount")),
      currency: stringField(data, "currency"),
      paidAt:
        status === "successful" || status === "success" ? dateField(data, "created_at") : null,
    };
  }

  async createSubaccount(input: SubaccountCreateInput): Promise<SubaccountCreateResult> {
    const data = await this.send("/subaccounts", {
      method: "POST",
      body: JSON.stringify({
        business_name: input.name,
        account_bank: input.settlementBank,
        account_number: input.accountNumber,
        split_type: "percentage",
        // Flutterwave takes the share kept by the subaccount as a fraction.
        split_value: input.percentageCharge / 100,
        country: "NG",
      }),
    });
    return {
      provider: this.name,
      code: stringField(data, "subaccount_id"),
      percentageCharge: input.percentageCharge,
    };
  }

  private async send(path: string, init: RequestInit): Promise<Record<string, unknown>> {
    if (!this.secretKey) {
      throw new PaymentProviderError(this.name, "Payment provider is not configured");
    }
    try {
      const response = await this.request(`https://api.flutterwave.com/v3${path}`, {
        ...init,
        headers: { Authorization: `Bearer ${this.secretKey}`, "Content-Type": "application/json" },
      });
      const body = (await response.json()) as FlutterwaveResponse;
      if (!response.ok || body.status !== "success" || !body.data) {
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

function invalid(): never {
  throw new PaymentProviderError(PROVIDER, "Payment provider returned invalid data");
}

function stringField(data: Record<string, unknown>, field: string): string {
  const value = data[field];
  if (typeof value === "number" && Number.isSafeInteger(value)) return String(value);
  if (typeof value !== "string" || !value) invalid();
  return value;
}

function numberField(data: Record<string, unknown>, field: string): number {
  const value = data[field];
  if (typeof value !== "number" || !Number.isFinite(value)) invalid();
  return value;
}

function dateField(data: Record<string, unknown>, field: string): Date | null {
  const value = data[field];
  if (value == null) return null;
  if (typeof value !== "string") invalid();
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) invalid();
  return date;
}
