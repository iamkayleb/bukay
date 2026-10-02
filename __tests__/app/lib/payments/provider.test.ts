import { describe, expect, expectTypeOf, it } from "vitest";

import {
  PaymentProviderError,
  type PaymentProvider,
  type PaymentStatus,
} from "@/app/lib/payments/provider";

describe("PaymentProvider", () => {
  it("exposes the provider operations used by booking payments", () => {
    // Checked as separate parameter/return assertions rather than one big
    // object literal: comparing several method-shorthand properties at once
    // through expect-type's toMatchTypeOf trips a TS/expect-type interaction
    // where bivariant method-parameter checking gets lost for some
    // properties, producing spurious "Expected: function, Actual: never"
    // errors under the TypeScript version this repo pins.
    expectTypeOf<PaymentProvider["name"]>().toBeString();

    expectTypeOf<Parameters<PaymentProvider["initialize"]>[0]>().toMatchTypeOf<{
      reference: string;
      amount: number;
      currency: string;
      customer: { email: string };
      callbackUrl: string;
    }>();
    expectTypeOf<Awaited<ReturnType<PaymentProvider["initialize"]>>>().toMatchTypeOf<{
      authorizationUrl: string;
    }>();

    expectTypeOf<Parameters<PaymentProvider["verify"]>[0]>().toBeString();
    expectTypeOf<Awaited<ReturnType<PaymentProvider["verify"]>>>().toMatchTypeOf<{
      status: PaymentStatus;
      paidAt: Date | null;
    }>();

    expectTypeOf<Parameters<PaymentProvider["createSubaccount"]>[0]>().toMatchTypeOf<{
      percentageCharge: number;
    }>();
    expectTypeOf<Awaited<ReturnType<PaymentProvider["createSubaccount"]>>>().toMatchTypeOf<{
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
