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
function toFlutterwaveAmount(amountCents: number, currency: string): number {
  if (!Number.isSafeInteger(amountCents) || amountCents < 0) {
    throw new PaymentProviderError("flutterwave", "Payment amount must be a non-negative integer");
  }
  return amountCents / currencyMinorUnitDivisor(currency);
}

function normalizeCurrency(currency: string): string {
  if (typeof currency !== "string" || !/^[a-z]{3}$/i.test(currency)) {
    throw new PaymentProviderError("flutterwave", "Payment currency must be a three-letter code");
  }
  return currency.toUpperCase();
}

function currencyMinorUnitDivisor(currency: string): number {
  const normalizedCurrency = normalizeCurrency(currency);
  try {
    const fractionDigits = new Intl.NumberFormat("en", {
      style: "currency",
      currency: normalizedCurrency,
    }).resolvedOptions().maximumFractionDigits;
    if (
      typeof fractionDigits !== "number" ||
      !Number.isSafeInteger(fractionDigits) ||
      fractionDigits < 0
    ) {
      throw new PaymentProviderError("flutterwave", "Payment currency is not supported");
    }
    return 10 ** fractionDigits;
  } catch {
    throw new PaymentProviderError("flutterwave", "Payment currency is not supported");
  }
}

function toFlutterwaveSplitRatio(percentageCharge: number): number {
  if (!Number.isFinite(percentageCharge) || percentageCharge < 0 || percentageCharge > 100) {
    throw new PaymentProviderError(
      "flutterwave",
      "Subaccount percentage must be between zero and one hundred"
    );
  }
  return percentageCharge / 100;
}

/** Converts Flutterwave's currency-unit amount to this port's minor units. */
export function flutterwaveAmountToCents(amount: number | string, currency: string): number {
  if (typeof amount !== "number" && typeof amount !== "string") {
    throw new PaymentProviderError("flutterwave", "Payment provider returned an invalid amount");
  }

  // Number() accepts hexadecimal and exponential strings. Those are not valid
  // Flutterwave currency amounts and would make the ledger accept an ambiguous
  // provider response.
  if (typeof amount === "string" && !/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(amount)) {
    throw new PaymentProviderError("flutterwave", "Payment provider returned an invalid amount");
  }

  const minorUnits = Number(amount) * currencyMinorUnitDivisor(currency);
  const cents = Math.round(minorUnits);
  if (
    !Number.isSafeInteger(cents) ||
    cents < 0 ||
    Math.abs(minorUnits - cents) > Number.EPSILON * Math.max(1, Math.abs(minorUnits))
  ) {
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
    const currency = normalizeCurrency(input.currency);
    const data = await this.post<{ link: string }>("/payments", {
      tx_ref: input.reference,
      amount: toFlutterwaveAmount(input.amountCents, currency),
      currency,
      redirect_url: input.callbackUrl,
      customer: { email: input.customerEmail },
      meta: input.metadata,
      ...(input.subaccountCode
        ? {
            subaccounts: [
              {
                id: input.subaccountCode,
                transaction_split_ratio:
                  input.subaccountPercentage === undefined
                    ? 1
                    : toFlutterwaveSplitRatio(input.subaccountPercentage),
              },
            ],
          }
        : {}),
    });

    if (!isRecord(data) || typeof data.link !== "string" || !isAbsoluteHttpUrl(data.link)) {
      throw new PaymentProviderError(this.name, "Payment provider returned an invalid response");
    }

    return { reference: input.reference, authorizationUrl: data.link };
  }

  async verify(reference: string): Promise<VerifiedPayment> {
    const data = await this.get<FlutterwaveTransaction>(
      `/transactions/verify_by_reference?tx_ref=${encodeURIComponent(reference)}`
    );
    if (
      !isRecord(data) ||
      typeof data.tx_ref !== "string" ||
      data.tx_ref !== reference ||
      typeof data.status !== "string" ||
      typeof data.currency !== "string" ||
      !data.currency.trim()
    ) {
      throw new PaymentProviderError(this.name, "Payment provider returned an invalid response");
    }

    const paidAt = data.created_at ? new Date(data.created_at) : undefined;
    if (paidAt && Number.isNaN(paidAt.getTime())) {
      throw new PaymentProviderError(this.name, "Payment provider returned an invalid response");
    }

    const currency = normalizeCurrency(data.currency);

    return {
      reference: data.tx_ref,
      status:
        data.status === "successful"
          ? "succeeded"
          : data.status === "failed"
            ? "failed"
            : "pending",
      amountCents: flutterwaveAmountToCents(data.amount, currency),
      currency,
      ...(paidAt ? { paidAt } : {}),
    };
  }

  async createSubaccount(input: CreateSubaccountInput): Promise<CreatedSubaccount> {
    const data = await this.post<FlutterwaveSubaccount>("/subaccounts", {
      business_name: input.businessName,
      account_bank: input.settlementBank,
      account_number: input.accountNumber,
      split_type: "percentage",
      split_value: toFlutterwaveSplitRatio(input.percentageCharge),
    });
    if (!isRecord(data)) {
      throw new PaymentProviderError(this.name, "Payment provider returned an invalid response");
    }

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

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new PaymentProviderError(this.name, "Payment provider returned an invalid response");
    }
    if (!isRecord(payload) || payload.status !== "success" || !payload.data) {
      throw new PaymentProviderError(this.name, "Payment provider returned an invalid response");
    }
    return payload.data as T;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
