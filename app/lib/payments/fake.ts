import type {
  PaymentInitializeInput,
  PaymentInitializeResult,
  PaymentProvider,
  PaymentVerification,
  SubaccountCreateInput,
  SubaccountCreateResult,
} from "./provider";

/** A deterministic provider for local development and route tests. */
export class FakePaymentProvider implements PaymentProvider {
  readonly name = "fake";

  constructor(private readonly verifications = new Map<string, PaymentVerification>()) {}

  async initialize(input: PaymentInitializeInput): Promise<PaymentInitializeResult> {
    return {
      provider: this.name,
      reference: input.reference,
      authorizationUrl: `https://payments.invalid/authorize/${encodeURIComponent(input.reference)}`,
    };
  }

  async verify(reference: string): Promise<PaymentVerification> {
    return (
      this.verifications.get(reference) ?? {
        provider: this.name,
        reference,
        status: "success",
        amount: 0,
        currency: "NGN",
        paidAt: new Date(),
      }
    );
  }

  async createSubaccount(input: SubaccountCreateInput): Promise<SubaccountCreateResult> {
    return {
      provider: this.name,
      code: `fake_${input.accountNumber}`,
      percentageCharge: input.percentageCharge,
    };
  }
}
