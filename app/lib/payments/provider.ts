/**
 * Payment provider port.
 *
 * Concrete adapters (Paystack, Fake) implement this interface so booking flow
 * can initialize a charge, redirect to checkout, and verify on callback without
 * coupling to a single PSP. Amounts are always integer minor units (kobo/cents).
 */

export type InitializePaymentInput = {
  /** Amount in minor currency units (e.g. kobo for NGN). */
  amountCents: number;
  currency: string;
  email: string;
  /** Unique idempotent reference for this charge. */
  reference: string;
  callbackUrl: string;
  /** Non-secret booking/tenant context passed through to the PSP. */
  metadata?: Record<string, string | number | boolean>;
  /** Provider subaccount code for tenant revenue split (e.g. Paystack `ACCT_…`). */
  subaccountCode?: string;
  /**
   * Platform share of the charge as a percentage (0–100).
   * Matches Paystack subaccount `percentage_charge` (portion retained by the main account).
   */
  platformSplitPercentage?: number;
};

export type InitializePaymentResult = {
  provider: string;
  reference: string;
  authorizationUrl: string;
  accessCode: string;
};

export type VerifyPaymentInput = {
  reference: string;
};

export type PaymentVerificationStatus = "success" | "failed" | "abandoned" | "pending";

export type VerifyPaymentResult = {
  provider: string;
  reference: string;
  status: PaymentVerificationStatus;
  amountCents: number;
  currency: string;
  paidAt: Date | null;
  /** Provider-native status string (e.g. Paystack `"success"`). */
  providerStatus: string;
  /** Subaccount applied to the charge, when known. */
  subaccountCode?: string | null;
  /** Platform percentage that was applied, when known. */
  platformSplitPercentage?: number | null;
};

export interface PaymentProvider {
  readonly name: string;
  initialize(input: InitializePaymentInput): Promise<InitializePaymentResult>;
  verify(input: VerifyPaymentInput): Promise<VerifyPaymentResult>;
}

export class PaymentProviderError extends Error {
  readonly provider: string;
  readonly status?: number;
  readonly cause?: unknown;

  constructor(
    provider: string,
    message: string,
    options: { status?: number; cause?: unknown } = {}
  ) {
    super(message);
    this.name = "PaymentProviderError";
    this.provider = provider;
    this.status = options.status;
    this.cause = options.cause;
  }
}

/**
 * Shared initialize validation for every PaymentProvider adapter.
 * Keeps Fake and Paystack on the same contract before any network I/O.
 */
export function assertInitializePaymentInput(
  provider: string,
  input: InitializePaymentInput,
  options: { requireCallbackUrl?: boolean } = {}
): void {
  if (!input.email) {
    throw new PaymentProviderError(provider, "Payment email is required");
  }
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) {
    throw new PaymentProviderError(provider, "Payment amountCents must be a positive integer");
  }
  if (!input.reference) {
    throw new PaymentProviderError(provider, "Payment reference is required");
  }
  if (options.requireCallbackUrl !== false && !input.callbackUrl) {
    throw new PaymentProviderError(provider, "Payment callbackUrl is required");
  }
  if (
    input.platformSplitPercentage !== undefined &&
    (!Number.isFinite(input.platformSplitPercentage) ||
      input.platformSplitPercentage < 0 ||
      input.platformSplitPercentage > 100)
  ) {
    throw new PaymentProviderError(
      provider,
      "platformSplitPercentage must be a number between 0 and 100"
    );
  }
}

/** Shared verify validation for every PaymentProvider adapter. */
export function assertVerifyPaymentInput(provider: string, input: VerifyPaymentInput): void {
  if (!input.reference) {
    throw new PaymentProviderError(provider, "Payment reference is required");
  }
}

/**
 * Replace known secret values in a string before writing to logs.
 * Empty / short placeholders are ignored so they cannot blank out the message.
 */
export function redactSecrets(value: string, secrets: ReadonlyArray<string>): string {
  let result = value;
  for (const secret of secrets) {
    if (!secret || secret.length < 8) continue;
    result = result.split(secret).join("[REDACTED]");
  }
  return result;
}
