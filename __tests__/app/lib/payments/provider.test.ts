import { describe, it, expect } from "vitest";

import {
  PaymentProviderError,
  assertInitializePaymentInput,
  assertVerifyPaymentInput,
  redactSecrets,
  type PaymentProvider,
  type InitializePaymentInput,
  type VerifyPaymentResult,
} from "@/app/lib/payments/provider";

describe("PaymentProvider port", () => {
  it("exposes PaymentProviderError with provider and optional status", () => {
    const err = new PaymentProviderError("fake", "boom", { status: 502 });
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("PaymentProviderError");
    expect(err.provider).toBe("fake");
    expect(err.message).toBe("boom");
    expect(err.status).toBe(502);
  });

  it("redacts secret values of sufficient length from log strings", () => {
    const secret = "sk_test_abcdefghijklmnopqrstuvwxyz";
    const message = `Authorization Bearer ${secret} failed`;
    expect(redactSecrets(message, [secret])).toBe("Authorization Bearer [REDACTED] failed");
    expect(redactSecrets(message, [secret])).not.toContain(secret);
  });

  it("ignores short placeholders so redaction cannot wipe the message", () => {
    expect(redactSecrets("status=ok", ["sk"])).toBe("status=ok");
    expect(redactSecrets("status=ok", [""])).toBe("status=ok");
  });

  it("assertInitializePaymentInput rejects invalid amounts and splits", () => {
    const base: InitializePaymentInput = {
      amountCents: 500_000,
      currency: "NGN",
      email: "guest@example.com",
      reference: "bk_ref_1",
      callbackUrl: "https://example.com/api/payments/verify",
    };
    expect(() => assertInitializePaymentInput("contract", base)).not.toThrow();
    expect(() => assertInitializePaymentInput("contract", { ...base, email: "" })).toThrow(
      /email is required/
    );
    expect(() => assertInitializePaymentInput("contract", { ...base, amountCents: 0 })).toThrow(
      /amountCents/
    );
    expect(() =>
      assertInitializePaymentInput("contract", { ...base, platformSplitPercentage: 150 })
    ).toThrow(/platformSplitPercentage/);
    expect(() => assertVerifyPaymentInput("contract", { reference: "" })).toThrow(/reference/);
  });

  it("accepts a structural PaymentProvider implementation", async () => {
    const input: InitializePaymentInput = {
      amountCents: 500_000,
      currency: "NGN",
      email: "guest@example.com",
      reference: "bk_ref_1",
      callbackUrl: "https://example.com/api/payments/verify",
      subaccountCode: "ACCT_test",
      platformSplitPercentage: 10,
    };

    const provider: PaymentProvider = {
      name: "contract",
      async initialize(req) {
        assertInitializePaymentInput(this.name, req);
        expect(req).toEqual(input);
        return {
          provider: "contract",
          reference: req.reference,
          authorizationUrl: "https://checkout.example/pay",
          accessCode: "access_1",
        };
      },
      async verify({ reference }) {
        assertVerifyPaymentInput(this.name, { reference });
        const result: VerifyPaymentResult = {
          provider: "contract",
          reference,
          status: "success",
          amountCents: input.amountCents,
          currency: input.currency,
          paidAt: new Date("2026-09-16T12:00:00.000Z"),
          providerStatus: "success",
          subaccountCode: input.subaccountCode,
          platformSplitPercentage: input.platformSplitPercentage,
        };
        return result;
      },
    };

    const init = await provider.initialize(input);
    expect(init.authorizationUrl).toContain("checkout");
    const verified = await provider.verify({ reference: input.reference });
    expect(verified.status).toBe("success");
    expect(verified.platformSplitPercentage).toBe(10);
  });
});
