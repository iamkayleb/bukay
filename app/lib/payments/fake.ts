import {
  InitializePaymentInput,
  InitializePaymentResult,
  PaymentProvider,
  PaymentProviderError,
  PaymentVerificationStatus,
  VerifyPaymentInput,
  VerifyPaymentResult,
} from "./provider";

export type FakePaymentRecord = {
  input: InitializePaymentInput;
  status: PaymentVerificationStatus;
  providerStatus: string;
  authorizationUrl: string;
  accessCode: string;
  paidAt: Date | null;
};

/**
 * In-memory PaymentProvider for tests and local CI.
 * Live Paystack credentials are never required.
 */
export class FakePaymentProvider implements PaymentProvider {
  readonly name = "fake";
  readonly charges = new Map<string, FakePaymentRecord>();
  private counter = 0;
  /** Default outcome applied when a charge is initialized. */
  defaultStatus: PaymentVerificationStatus = "pending";

  async initialize(input: InitializePaymentInput): Promise<InitializePaymentResult> {
    if (!input.email) {
      throw new PaymentProviderError(this.name, "Payment email is required");
    }
    if (!Number.isFinite(input.amountCents) || input.amountCents <= 0) {
      throw new PaymentProviderError(this.name, "Payment amountCents must be a positive integer");
    }
    if (!input.reference) {
      throw new PaymentProviderError(this.name, "Payment reference is required");
    }

    this.counter += 1;
    const accessCode = `fake_access_${this.counter}`;
    const authorizationUrl = `https://checkout.fake.test/pay/${encodeURIComponent(input.reference)}`;
    this.charges.set(input.reference, {
      input: { ...input },
      status: this.defaultStatus,
      providerStatus: this.defaultStatus,
      authorizationUrl,
      accessCode,
      paidAt: this.defaultStatus === "success" ? new Date() : null,
    });

    return {
      provider: this.name,
      reference: input.reference,
      authorizationUrl,
      accessCode,
    };
  }

  async verify(input: VerifyPaymentInput): Promise<VerifyPaymentResult> {
    if (!input.reference) {
      throw new PaymentProviderError(this.name, "Payment reference is required");
    }
    const record = this.charges.get(input.reference);
    if (!record) {
      throw new PaymentProviderError(this.name, `Unknown reference ${input.reference}`, {
        status: 404,
      });
    }

    return {
      provider: this.name,
      reference: input.reference,
      status: record.status,
      amountCents: record.input.amountCents,
      currency: record.input.currency,
      paidAt: record.paidAt,
      providerStatus: record.providerStatus,
      subaccountCode: record.input.subaccountCode ?? null,
      platformSplitPercentage: record.input.platformSplitPercentage ?? null,
    };
  }

  /** Mark an initialized charge as successful (test-mode payment). */
  succeed(reference: string, paidAt: Date = new Date()): void {
    const record = this.charges.get(reference);
    if (!record) {
      throw new PaymentProviderError(this.name, `Unknown reference ${reference}`, { status: 404 });
    }
    record.status = "success";
    record.providerStatus = "success";
    record.paidAt = paidAt;
  }

  /** Mark an initialized charge as failed. */
  fail(reference: string): void {
    const record = this.charges.get(reference);
    if (!record) {
      throw new PaymentProviderError(this.name, `Unknown reference ${reference}`, { status: 404 });
    }
    record.status = "failed";
    record.providerStatus = "failed";
    record.paidAt = null;
  }

  reset(): void {
    this.charges.clear();
    this.counter = 0;
    this.defaultStatus = "pending";
  }
}
