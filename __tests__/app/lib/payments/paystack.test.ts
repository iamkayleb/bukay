import { describe, expect, it, vi } from "vitest";

import { FakePaymentProvider } from "@/app/lib/payments/fake";
import { PaystackPaymentProvider } from "@/app/lib/payments/paystack";

describe("PaystackPaymentProvider", () => {
  it("translates initialization input without exposing the provider response", async () => {
    const request = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          status: true,
          data: { reference: "booking-1", authorization_url: "https://pay.test/a" },
        }),
        { status: 200 }
      )
    );
    const provider = new PaystackPaymentProvider("test-key", request);

    await expect(
      provider.initialize({
        reference: "booking-1",
        amountCents: 5_000,
        currency: "NGN",
        customerEmail: "ada@example.test",
        callbackUrl: "https://bukay.test/api/payments/verify",
        subaccountCode: "ACCT_1",
        subaccountPercentage: 85,
      })
    ).resolves.toEqual({ reference: "booking-1", authorizationUrl: "https://pay.test/a" });

    expect(request).toHaveBeenCalledWith(
      "https://api.paystack.co/transaction/initialize",
      expect.objectContaining({
        headers: expect.objectContaining({ authorization: "Bearer test-key" }),
      })
    );
    expect(JSON.parse(request.mock.calls[0][1].body)).toMatchObject({
      amount: 5_000,
      subaccount: "ACCT_1",
    });
  });

  it("uses the configured percentage when creating a subaccount", async () => {
    const request = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          status: true,
          data: { subaccount_code: "ACCT_1", percentage_charge: 85 },
        }),
        { status: 200 }
      )
    );
    const provider = new PaystackPaymentProvider("test-key", request);

    await expect(
      provider.createSubaccount({
        businessName: "Bukay",
        settlementBank: "058",
        accountNumber: "0123456789",
        percentageCharge: 85,
      })
    ).resolves.toEqual({ code: "ACCT_1", percentageCharge: 85 });

    expect(JSON.parse(request.mock.calls[0][1].body)).toMatchObject({ percentage_charge: 85 });
  });

  it("normalizes verified payment states and sanitizes rejected responses", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: true,
            data: {
              reference: "booking/1",
              status: "success",
              amount: 5_000,
              currency: "NGN",
              paid_at: "2026-09-16T12:00:00.000Z",
            },
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(new Response("sensitive provider detail", { status: 401 }));
    const provider = new PaystackPaymentProvider("test-key", request);

    await expect(provider.verify("booking/1")).resolves.toMatchObject({
      reference: "booking/1",
      status: "succeeded",
      amountCents: 5_000,
    });
    await expect(provider.verify("booking-2")).rejects.toMatchObject({
      message: "Payment provider request was rejected",
      status: 401,
    });
    expect(request.mock.calls[0][0]).toContain("booking%2F1");
  });
});

describe("FakePaymentProvider", () => {
  it("returns deterministic test-mode payment and subaccount results", async () => {
    const provider = new FakePaymentProvider();
    await provider.initialize({
      reference: "booking-1",
      amountCents: 5_000,
      currency: "NGN",
      customerEmail: "ada@example.test",
      callbackUrl: "https://bukay.test/api/payments/verify",
    });

    await expect(provider.verify("booking-1")).resolves.toMatchObject({ status: "succeeded" });
    await expect(
      provider.createSubaccount({
        businessName: "Bukay",
        settlementBank: "058",
        accountNumber: "0123456789",
        percentageCharge: 85,
      })
    ).resolves.toEqual({ code: "FAKE_SUBACCOUNT_1", percentageCharge: 85 });
  });
});
