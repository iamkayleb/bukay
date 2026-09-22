import { describe, expect, expectTypeOf, it } from "vitest";

import {
  PaymentProviderError,
  type PaymentProvider,
  type PaymentStatus,
} from "@/app/lib/payments/provider";

describe("PaymentProvider", () => {
  it("exposes the provider operations used by booking payments", () => {
    expectTypeOf<PaymentProvider["name"]>().toEqualTypeOf<string>();

    expectTypeOf<PaymentProvider["initialize"]>().parameter(0).toMatchTypeOf<{
      reference: string;
      amount: number;
      currency: string;
      customer: { email: string };
      callbackUrl: string;
    }>();
    expectTypeOf<PaymentProvider["initialize"]>().returns.resolves.toMatchTypeOf<{
      authorizationUrl: string;
    }>();

    expectTypeOf<PaymentProvider["verify"]>().parameter(0).toEqualTypeOf<string>();
    expectTypeOf<PaymentProvider["verify"]>().returns.resolves.toMatchTypeOf<{
      status: PaymentStatus;
      paidAt: Date | null;
    }>();

    expectTypeOf<PaymentProvider["createSubaccount"]>().parameter(0).toMatchTypeOf<{
      percentageCharge: number;
    }>();
    expectTypeOf<PaymentProvider["createSubaccount"]>().returns.resolves.toMatchTypeOf<{
      code: string;
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
