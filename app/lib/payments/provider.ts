/**
 * The provider-neutral representation of a payment in the smallest unit of
 * its currency. Keeping this at the boundary prevents callers from depending
 * on Paystack's response shape or field names.
 */
export type PaymentStatus = "pending" | "succeeded" | "failed";

export type InitializePaymentInput = {
  /** A unique, application-generated reference used to reconcile callbacks. */
  reference: string;
  /** Amount in the currency's minor unit (for example, kobo for NGN). */
  amountCents: number;
  currency: string;
  customerEmail: string;
  callbackUrl: string;
  metadata?: Record<string, string>;
  subaccountCode?: string;
  /** Percentage of the charge that should be settled to the subaccount. */
  subaccountPercentage?: number;
};

export type InitializedPayment = {
  reference: string;
  authorizationUrl: string;
};

export type VerifiedPayment = {
  reference: string;
  status: PaymentStatus;
  amountCents: number;
  currency: string;
  paidAt?: Date;
};

export type CreateSubaccountInput = {
  businessName: string;
  settlementBank: string;
  accountNumber: string;
  /** Percentage of each transaction to settle to this subaccount. */
  percentageCharge: number;
};

export type CreatedSubaccount = {
  code: string;
  percentageCharge: number;
};

/**
 * Payment boundary used by booking flows. Implementations must not expose
 * provider credentials or provider-specific response objects to callers.
 */
export interface PaymentProvider {
  readonly name: string;

  initialize(input: InitializePaymentInput): Promise<InitializedPayment>;
  verify(reference: string): Promise<VerifiedPayment>;
  createSubaccount(input: CreateSubaccountInput): Promise<CreatedSubaccount>;
}

export class PaymentProviderError extends Error {
  readonly provider: string;
  readonly status?: number;

  constructor(provider: string, message: string, options: { status?: number } = {}) {
    super(message);
    this.name = "PaymentProviderError";
    this.provider = provider;
    this.status = options.status;
  }
}
