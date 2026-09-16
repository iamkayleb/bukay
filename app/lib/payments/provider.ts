/**
 * Provider-neutral payment boundary. Amounts are represented in the currency's
 * smallest unit (kobo for NGN) so adapters never need to round money values.
 */
export type PaymentStatus = "pending" | "success" | "failed";

export type PaymentInitializeInput = {
  reference: string;
  amount: number;
  currency: string;
  customer: {
    email: string;
    name?: string;
    phone?: string;
  };
  callbackUrl: string;
  metadata?: Record<string, string>;
  subaccountCode?: string;
};

export type PaymentInitializeResult = {
  provider: string;
  reference: string;
  authorizationUrl: string;
};

export type PaymentVerification = {
  provider: string;
  reference: string;
  status: PaymentStatus;
  amount: number;
  currency: string;
  paidAt: Date | null;
};

export type SubaccountCreateInput = {
  name: string;
  settlementBank: string;
  accountNumber: string;
  percentageCharge: number;
  currency: string;
};

export type SubaccountCreateResult = {
  provider: string;
  code: string;
  percentageCharge: number;
};

export interface PaymentProvider {
  readonly name: string;
  initialize(input: PaymentInitializeInput): Promise<PaymentInitializeResult>;
  verify(reference: string): Promise<PaymentVerification>;
  createSubaccount(input: SubaccountCreateInput): Promise<SubaccountCreateResult>;
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
