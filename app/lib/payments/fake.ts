import type {
  CreatedSubaccount,
  CreateSubaccountInput,
  InitializedPayment,
  InitializePaymentInput,
  VerifiedPayment,
} from "./provider";

/** In-memory provider for local and automated test-mode booking flows. */
export class FakePaymentProvider {
  readonly name = "fake";
  private readonly payments = new Map<string, VerifiedPayment>();
  private subaccountNumber = 0;

  constructor(private readonly verificationStatus: VerifiedPayment["status"] = "succeeded") {}

  async initialize(input: InitializePaymentInput): Promise<InitializedPayment> {
    this.payments.set(input.reference, {
      reference: input.reference,
      status: this.verificationStatus,
      amountCents: input.amountCents,
      currency: input.currency,
      ...(this.verificationStatus === "succeeded" ? { paidAt: new Date() } : {}),
    });
    return {
      reference: input.reference,
      authorizationUrl: `https://payments.test/checkout/${encodeURIComponent(input.reference)}`,
    };
  }

  async verify(reference: string): Promise<VerifiedPayment> {
    return (
      this.payments.get(reference) ?? {
        reference,
        status: "failed",
        amountCents: 0,
        currency: "NGN",
      }
    );
  }

  async createSubaccount(input: CreateSubaccountInput): Promise<CreatedSubaccount> {
    this.subaccountNumber += 1;
    return {
      code: `FAKE_SUBACCOUNT_${this.subaccountNumber}`,
      percentageCharge: input.percentageCharge,
    };
  }
}
