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

const NAME = "flutterwave";

// The payment port speaks minor units (kobo); Flutterwave speaks major units.
const MINOR_UNITS_PER_MAJOR = 100;

export class FlutterwavePaymentProvider implements PaymentProvider {
  readonly name = NAME;

  constructor(
    private readonly secretKey = process.env.FLUTTERWAVE_SECRET_KEY,
    private readonly request = fetch
  ) {}

  async initialize(input: PaymentInitializeInput): Promise<PaymentInitializeResult> {
    const data = await this.send("/payments", {
      method: "POST",
      body: JSON.stringify({
        tx_ref: input.reference,
        amount: input.amount / MINOR_UNITS_PER_MAJOR,
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
    // Flutterwave does not echo the reference back, so the caller's tx_ref is it.
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
      status: status === "successful" ? "success" : status === "pending" ? "pending" : "failed",
      amount: minorUnitField(data, "amount"),
      currency: stringField(data, "currency"),
      paidAt: status === "successful" ? dateField(data, "created_at") : null,
    };
  }

  async createSubaccount(input: SubaccountCreateInput): Promise<SubaccountCreateResult> {
    const data = await this.send("/subaccounts", {
      method: "POST",
      body: JSON.stringify({
        business_name: input.name,
        account_bank: input.settlementBank,
        account_number: input.accountNumber,
        country: "NG",
        split_type: "percentage",
        // Flutterwave takes a fraction (0.2 = 20%); the port takes a percentage.
        split_value: input.percentageCharge / 100,
      }),
    });
    return {
      provider: this.name,
      code: stringField(data, "subaccount_id"),
      percentageCharge: Math.round(numberField(data, "split_value") * 10000) / 100,
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

function invalid(): PaymentProviderError {
  return new PaymentProviderError(NAME, "Payment provider returned invalid data");
}

function stringField(data: Record<string, unknown>, field: string): string {
  const value = data[field];
  if (typeof value !== "string" || !value) throw invalid();
  return value;
}

function numberField(data: Record<string, unknown>, field: string): number {
  const value = data[field];
  if (typeof value !== "number" || !Number.isFinite(value)) throw invalid();
  return value;
}

function minorUnitField(data: Record<string, unknown>, field: string): number {
  return Math.round(numberField(data, field) * MINOR_UNITS_PER_MAJOR);
}

function dateField(data: Record<string, unknown>, field: string): Date | null {
  const value = data[field];
  if (value == null) return null;
  if (typeof value !== "string") throw invalid();
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw invalid();
  return date;
}
