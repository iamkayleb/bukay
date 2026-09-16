import { describe, expect, expectTypeOf, it } from "vitest";

import {
  PaymentProviderError,
  type PaymentProvider,
  type PaymentStatus,
} from "@/app/lib/payments/provider";

describe("PaymentProvider", () => {
  it("exposes the provider operations used by booking payments", () => {
    expectTypeOf<PaymentProvider>().toMatchTypeOf<{
      name: string;
      initialize: (input: {
        reference: string;
        amount: number;
        currency: string;
        customer: { email: string };
        callbackUrl: string;
      }) => Promise<{ authorizationUrl: string }>;
      verify: (reference: string) => Promise<{ status: PaymentStatus; paidAt: Date | null }>;
      createSubaccount: (input: { percentageCharge: number }) => Promise<{ code: string }>;
    }>();
  });

  it("preserves safe provider error context", () => {
    const cause = new Error("network unavailable");
    const error = new PaymentProviderError("paystack", "Unable to verify payment", {
      status: 502,
      cause,
    });

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("PaymentProviderError");
    expect(error.provider).toBe("paystack");
    expect(error.status).toBe(502);
    expect(error.cause).toBe(cause);
  });
});
