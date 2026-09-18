import { describe, expect, it } from "vitest";

import type {
  CreateSubaccountInput,
  InitializedPayment,
  InitializePaymentInput,
  PaymentProvider,
  VerifiedPayment,
} from "@/app/lib/payments/provider";

describe("PaymentProvider", () => {
  it("keeps initialization, verification, and subaccount setup behind one port", async () => {
    const provider: PaymentProvider = {
      name: "test",
      async initialize(input: InitializePaymentInput): Promise<InitializedPayment> {
        return { reference: input.reference, authorizationUrl: "https://checkout.test/pay" };
      },
      async verify(reference: string): Promise<VerifiedPayment> {
        return {
          reference,
          status: "succeeded",
          amountCents: 5_000,
          currency: "NGN",
          paidAt: new Date("2026-09-16T12:00:00.000Z"),
        };
      },
      async createSubaccount(input: CreateSubaccountInput) {
        return { code: "ACCT_test", percentageCharge: input.percentageCharge };
      },
    };

    await expect(
      provider.initialize({
        reference: "booking-1",
        amountCents: 5_000,
        currency: "NGN",
        customerEmail: "ada@example.test",
        callbackUrl: "https://bukay.test/api/payments/verify",
        subaccountCode: "ACCT_test",
        subaccountPercentage: 85,
      })
    ).resolves.toEqual({ reference: "booking-1", authorizationUrl: "https://checkout.test/pay" });
    await expect(provider.verify("booking-1")).resolves.toMatchObject({ status: "succeeded" });
    await expect(
      provider.createSubaccount({
        businessName: "Bukay Demo",
        settlementBank: "058",
        accountNumber: "0123456789",
        percentageCharge: 85,
      })
    ).resolves.toEqual({ code: "ACCT_test", percentageCharge: 85 });
  });
});
