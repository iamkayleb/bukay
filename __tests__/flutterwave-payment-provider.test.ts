import { describe, expect, it, vi } from "vitest";

import { FlutterwavePaymentProvider } from "@/app/lib/payments/flutterwave";
import { PaymentProviderError } from "@/app/lib/payments/provider";

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

describe("FlutterwavePaymentProvider", () => {
  it("initializes a hosted checkout using the provider-neutral payment shape", async () => {
    const request = vi.fn().mockResolvedValue(
      jsonResponse({
        status: "success",
        data: { link: "https://checkout.flutterwave.com/pay/test" },
      })
    );
    const provider = new FlutterwavePaymentProvider("api-key", request);

    await expect(
      provider.initialize({
        reference: "booking-1",
        amountCents: 15_000,
        currency: "NGN",
        customerEmail: "customer@example.com",
        callbackUrl: "https://bukay.test/payment-complete",
        metadata: { bookingId: "booking-1" },
        subaccountCode: "RS_123",
      })
    ).resolves.toEqual({
      reference: "booking-1",
      authorizationUrl: "https://checkout.flutterwave.com/pay/test",
    });

    expect(request).toHaveBeenCalledWith("https://api.flutterwave.com/v3/payments", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer api-key" },
      body: JSON.stringify({
        tx_ref: "booking-1",
        amount: 150,
        currency: "NGN",
        redirect_url: "https://bukay.test/payment-complete",
        customer: { email: "customer@example.com" },
        meta: { bookingId: "booking-1" },
        subaccounts: [{ id: "RS_123", transaction_split_ratio: 1 }],
      }),
    });
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects an invalid minor-unit checkout amount before requesting Flutterwave: %s",
    async (amountCents) => {
      const request = vi.fn();
      const provider = new FlutterwavePaymentProvider("api-key", request);

      await expect(
        provider.initialize({
          reference: "booking-1",
          amountCents,
          currency: "NGN",
          customerEmail: "customer@example.com",
          callbackUrl: "https://bukay.test/payment-complete",
        })
      ).rejects.toEqual(expect.objectContaining({ provider: "flutterwave" }));
      expect(request).not.toHaveBeenCalled();
    }
  );

  it("normalizes Flutterwave verification results", async () => {
    const request = vi.fn().mockResolvedValue(
      jsonResponse({
        status: "success",
        data: {
          tx_ref: "booking 1",
          status: "successful",
          amount: "150",
          currency: "NGN",
          created_at: "2026-10-02T10:00:00.000Z",
        },
      })
    );
    const provider = new FlutterwavePaymentProvider("api-key", request);

    await expect(provider.verify("booking 1")).resolves.toEqual({
      reference: "booking 1",
      status: "succeeded",
      amountCents: 15_000,
      currency: "NGN",
      paidAt: new Date("2026-10-02T10:00:00.000Z"),
    });
    expect(request).toHaveBeenCalledWith(
      "https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=booking%201",
      { method: "GET", headers: { authorization: "Bearer api-key" } }
    );
  });

  it("creates split subaccounts and converts Flutterwave ratios to percentages", async () => {
    const request = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ status: "success", data: { subaccount_id: "RS_123", split_value: 0.35 } })
      );
    const provider = new FlutterwavePaymentProvider("api-key", request);

    await expect(
      provider.createSubaccount({
        businessName: "Bukay Salon",
        settlementBank: "044",
        accountNumber: "0690000037",
        percentageCharge: 35,
      })
    ).resolves.toEqual({ code: "RS_123", percentageCharge: 35 });
  });

  it.each([-1, 101, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects an invalid split percentage before requesting Flutterwave: %s",
    async (percentageCharge) => {
      const request = vi.fn();
      const provider = new FlutterwavePaymentProvider("api-key", request);

      await expect(
        provider.createSubaccount({
          businessName: "Bukay Salon",
          settlementBank: "044",
          accountNumber: "0690000037",
          percentageCharge,
        })
      ).rejects.toEqual(expect.objectContaining({ provider: "flutterwave" }));
      expect(request).not.toHaveBeenCalled();
    }
  );

  it("rejects malformed checkout and subaccount responses", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ status: "success", data: { link: "javascript:alert(1)" } })
      )
      .mockResolvedValueOnce(
        jsonResponse({ status: "success", data: { subaccount_id: "RS_123", split_value: 1.5 } })
      );
    const provider = new FlutterwavePaymentProvider("api-key", request);

    await expect(
      provider.initialize({
        reference: "booking-1",
        amountCents: 15_000,
        currency: "NGN",
        customerEmail: "customer@example.com",
        callbackUrl: "https://bukay.test/payment-complete",
      })
    ).rejects.toEqual(expect.objectContaining({ provider: "flutterwave" }));

    await expect(
      provider.createSubaccount({
        businessName: "Bukay Salon",
        settlementBank: "044",
        accountNumber: "0690000037",
        percentageCharge: 35,
      })
    ).rejects.toEqual(expect.objectContaining({ provider: "flutterwave" }));
  });

  it("rejects a non-object subaccount response", async () => {
    const request = vi.fn().mockResolvedValue(jsonResponse({ status: "success", data: [] }));
    const provider = new FlutterwavePaymentProvider("api-key", request);

    await expect(
      provider.createSubaccount({
        businessName: "Bukay Salon",
        settlementBank: "044",
        accountNumber: "0690000037",
        percentageCharge: 35,
      })
    ).rejects.toEqual(expect.objectContaining({ provider: "flutterwave" }));
  });

  it("returns provider errors without leaking transport details", async () => {
    const request = vi.fn().mockResolvedValue(jsonResponse({ status: "error" }, 401));
    const provider = new FlutterwavePaymentProvider("api-key", request);

    await expect(provider.verify("booking-1")).rejects.toEqual(
      expect.objectContaining<Partial<PaymentProviderError>>({
        name: "PaymentProviderError",
        provider: "flutterwave",
        status: 401,
      })
    );
  });

  it("rejects malformed amounts before they can reach ledger writes", async () => {
    const request = vi.fn().mockResolvedValue(
      jsonResponse({
        status: "success",
        data: {
          tx_ref: "booking-1",
          status: "successful",
          amount: "not-a-number",
          currency: "NGN",
        },
      })
    );
    const provider = new FlutterwavePaymentProvider("api-key", request);

    await expect(provider.verify("booking-1")).rejects.toEqual(
      expect.objectContaining<Partial<PaymentProviderError>>({
        name: "PaymentProviderError",
        provider: "flutterwave",
      })
    );
  });

  it.each([null, {}, []])("rejects non-numeric verification amounts: %j", async (amount) => {
    const request = vi.fn().mockResolvedValue(
      jsonResponse({
        status: "success",
        data: {
          tx_ref: "booking-1",
          status: "successful",
          amount,
          currency: "NGN",
        },
      })
    );
    const provider = new FlutterwavePaymentProvider("api-key", request);

    await expect(provider.verify("booking-1")).rejects.toEqual(
      expect.objectContaining<Partial<PaymentProviderError>>({
        name: "PaymentProviderError",
        provider: "flutterwave",
      })
    );
  });

  it("rejects verification amounts with fractions smaller than a minor unit", async () => {
    const request = vi.fn().mockResolvedValue(
      jsonResponse({
        status: "success",
        data: {
          tx_ref: "booking-1",
          status: "successful",
          amount: "150.001",
          currency: "NGN",
        },
      })
    );
    const provider = new FlutterwavePaymentProvider("api-key", request);

    await expect(provider.verify("booking-1")).rejects.toEqual(
      expect.objectContaining<Partial<PaymentProviderError>>({
        name: "PaymentProviderError",
        provider: "flutterwave",
      })
    );
  });

  it("rejects a verification response for a different payment reference", async () => {
    const request = vi.fn().mockResolvedValue(
      jsonResponse({
        status: "success",
        data: {
          tx_ref: "another-booking",
          status: "successful",
          amount: "150",
          currency: "NGN",
        },
      })
    );
    const provider = new FlutterwavePaymentProvider("api-key", request);

    await expect(provider.verify("booking-1")).rejects.toEqual(
      expect.objectContaining<Partial<PaymentProviderError>>({
        name: "PaymentProviderError",
        provider: "flutterwave",
      })
    );
  });

  it.each([
    { data: null },
    { data: { tx_ref: "booking-1", status: "successful", amount: "150", currency: 566 } },
  ])("rejects malformed verification response data: %j", async (response) => {
    const request = vi.fn().mockResolvedValue(jsonResponse({ status: "success", ...response }));
    const provider = new FlutterwavePaymentProvider("api-key", request);

    await expect(provider.verify("booking-1")).rejects.toEqual(
      expect.objectContaining<Partial<PaymentProviderError>>({
        name: "PaymentProviderError",
        provider: "flutterwave",
      })
    );
  });

  it("rejects a malformed response envelope", async () => {
    const request = vi.fn().mockResolvedValue(jsonResponse(null));
    const provider = new FlutterwavePaymentProvider("api-key", request);

    await expect(provider.verify("booking-1")).rejects.toEqual(
      expect.objectContaining<Partial<PaymentProviderError>>({
        name: "PaymentProviderError",
        provider: "flutterwave",
      })
    );
  });
});
