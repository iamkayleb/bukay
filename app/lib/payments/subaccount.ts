import { PaymentProviderError, redactSecrets } from "@/app/lib/payments/provider";

export type CreateSubaccountInput = {
  businessName: string;
  bankCode: string;
  accountNumber: string;
  /**
   * Percentage of each charge retained by the platform (Paystack main account).
   * Remainder settles to the tenant subaccount.
   */
  percentageCharge: number;
  primaryContactEmail?: string;
};

export type CreateSubaccountResult = {
  subaccountCode: string;
  businessName: string;
  percentageCharge: number;
  settlementBank: string;
  accountNumber: string;
};

export type SubaccountClientConfig = {
  secretKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
};

type PaystackSubaccountData = {
  subaccount_code?: string;
  business_name?: string;
  percentage_charge?: number;
  settlement_bank?: string;
  account_number?: string;
};

type PaystackEnvelope<T> = {
  status?: boolean;
  message?: string;
  data?: T;
};

const DEFAULT_BASE_URL = "https://api.paystack.co";

/**
 * Create a Paystack subaccount during tenant setup so booking charges can split
 * revenue according to the configured platform percentage.
 */
export async function createPaystackSubaccount(
  config: SubaccountClientConfig,
  input: CreateSubaccountInput
): Promise<CreateSubaccountResult> {
  if (!config.secretKey) {
    throw new Error("createPaystackSubaccount requires a secretKey");
  }
  if (!input.businessName.trim()) {
    throw new PaymentProviderError("paystack", "businessName is required");
  }
  if (!input.bankCode.trim() || !input.accountNumber.trim()) {
    throw new PaymentProviderError("paystack", "bankCode and accountNumber are required");
  }
  if (
    !Number.isFinite(input.percentageCharge) ||
    input.percentageCharge < 0 ||
    input.percentageCharge > 100
  ) {
    throw new PaymentProviderError(
      "paystack",
      "percentageCharge must be a number between 0 and 100"
    );
  }

  const fetchImpl = config.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new Error("createPaystackSubaccount requires a fetch implementation");
  }

  const baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
  const payload = {
    business_name: input.businessName.trim(),
    bank_code: input.bankCode.trim(),
    account_number: input.accountNumber.trim(),
    percentage_charge: input.percentageCharge,
    ...(input.primaryContactEmail
      ? { primary_contact_email: input.primaryContactEmail.trim() }
      : {}),
  };

  let response: Response;
  try {
    response = await fetchImpl(`${baseUrl}/subaccount`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    throw new PaymentProviderError(
      "paystack",
      redactSecrets("Failed to reach Paystack subaccount API", [config.secretKey]),
      { cause: err }
    );
  }

  let parsed: PaystackEnvelope<PaystackSubaccountData> | undefined;
  try {
    parsed = (await response.json()) as PaystackEnvelope<PaystackSubaccountData>;
  } catch (err) {
    throw new PaymentProviderError(
      "paystack",
      redactSecrets("Invalid JSON from Paystack subaccount API", [config.secretKey]),
      { status: response.status, cause: err }
    );
  }

  if (!response.ok || !parsed?.status || !parsed.data?.subaccount_code) {
    throw new PaymentProviderError(
      "paystack",
      redactSecrets(parsed?.message ?? `Paystack responded ${response.status}`, [config.secretKey]),
      { status: response.status }
    );
  }

  const data = parsed.data;
  return {
    subaccountCode: data.subaccount_code!,
    businessName: data.business_name ?? input.businessName.trim(),
    percentageCharge: data.percentage_charge ?? input.percentageCharge,
    settlementBank: data.settlement_bank ?? input.bankCode.trim(),
    accountNumber: data.account_number ?? input.accountNumber.trim(),
  };
}

export function subaccountFromEnv(
  env: NodeJS.ProcessEnv = process.env
): Omit<SubaccountClientConfig, "fetchImpl"> {
  return {
    secretKey: env.PAYSTACK_SECRET_KEY ?? "",
    baseUrl: env.PAYSTACK_BASE_URL,
  };
}
