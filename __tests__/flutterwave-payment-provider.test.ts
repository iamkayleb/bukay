import { describe, expect, it, vi } from "vitest";

import { FlutterwavePaymentProvider } from "@/app/lib/payments/flutterwave";
import { PaymentProviderError } from "@/app/lib/payments/provider";

const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

describe("FlutterwavePaymentProvider", () => {
  it("initializes a provider-neutral checkout and passes split settings", async () => {
    const request = vi.fn().mockResolvedValue(
      response({
        status: "success",
        data: { tx_ref: "booking-1", link: "https://checkout.test/1" },
      })
    );
    const provider = new FlutterwavePaymentProvider("test-key", request);

    await expect(
      provider.initialize({
        reference: "booking-1",
        amountCents: 2_500,
        currency: "NGN",
        customerEmail: "customer@example.com",
        callbackUrl: "https://bukay.test/payments/callback",
        metadata: { bookingId: "booking-1" },
        subaccountCode: "SUB-1",
        subaccountPercentage: 20,
      })
    ).resolves.toEqual({ reference: "booking-1", authorizationUrl: "https://checkout.test/1" });

    expect(request).toHaveBeenCalledWith(
      "https://api.flutterwave.com/v3/payments",
      expect.objectContaining({
        headers: expect.objectContaining({ authorization: "Bearer test-key" }),
      })
    );
    expect(JSON.parse(request.mock.calls[0][1].body)).toMatchObject({
      tx_ref: "booking-1",
      amount: 25,
      customer: { email: "customer@example.com" },
      subaccounts: [{ id: "SUB-1", transaction_split_ratio: 20 }],
    });
  });

  it("normalizes verified transactions and rejects invalid provider responses", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(
        response({
          status: "success",
          data: {
            tx_ref: "booking-1",
            status: "successful",
            amount: "25",
            currency: "NGN",
            paid_at: "2026-10-02T12:00:00.000Z",
          },
        })
      )
      .mockResolvedValueOnce(response({ status: "error" }));
    const provider = new FlutterwavePaymentProvider("test-key", request);

    await expect(provider.verify("booking-1")).resolves.toEqual({
      reference: "booking-1",
      status: "succeeded",
      amountCents: 2_500,
      currency: "NGN",
      paidAt: new Date("2026-10-02T12:00:00.000Z"),
    });
    expect(request.mock.calls[0][0]).toBe(
      "https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=booking-1"
    );
    await expect(provider.verify("booking-2")).rejects.toBeInstanceOf(PaymentProviderError);
  });

  it("creates collection subaccounts with Flutterwave's percentage format", async () => {
    const request = vi
      .fn()
      .mockResolvedValue(
        response({ status: "success", data: { subaccount_id: "SUB-1", split_value: 0.2 } })
      );
    const provider = new FlutterwavePaymentProvider("test-key", request);

    await expect(
      provider.createSubaccount({
        businessName: "Bukay",
        settlementBank: "058",
        accountNumber: "0123456789",
        country: "NG",
        businessMobile: "08001234567",
        percentageCharge: 20,
      })
    ).resolves.toEqual({ code: "SUB-1", percentageCharge: 20 });

    expect(JSON.parse(request.mock.calls[0][1].body)).toMatchObject({
      country: "NG",
      business_mobile: "08001234567",
      split_type: "percentage",
      split_value: 0.2,
    });
  });
});
