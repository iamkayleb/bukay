import { describe, it, expect, vi } from "vitest";

import {
  FlutterwaveProvider,
  flutterwaveAmountToMinorUnits,
  minorUnitsToFlutterwaveAmount,
} from "@/app/lib/payments/flutterwave";
import { PaymentProviderError } from "@/app/lib/payments/provider";

function jsonResponse(body: unknown, init: { status?: number } = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json" },
  });
}

type FetchMock = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const SECRET = "FLWSECK_TEST_abcdefghijklmnopqrstuvwxyz123456";

const baseInput = {
  amountCents: 15_000_00,
  currency: "NGN",
  email: "guest@example.com",
  reference: "bk_ref_1",
  callbackUrl: "https://app.example/api/payments/verify",
  subaccountCode: "RS_tenant",
  platformSplitPercentage: 12,
};

describe("Flutterwave amount conversion", () => {
  it("converts minor units to major units for the Flutterwave API", () => {
    expect(minorUnitsToFlutterwaveAmount(15_000_00)).toBe(15_000);
    expect(flutterwaveAmountToMinorUnits(15_000)).toBe(15_000_00);
  });
});

describe("FlutterwaveProvider", () => {
  it("requires a secretKey", () => {
    expect(() => new FlutterwaveProvider({ secretKey: "" })).toThrow(/secretKey/);
  });

  it("POSTs /payments with split metadata and returns checkout fields", async () => {
    const fetchImpl = vi.fn<Parameters<FetchMock>, ReturnType<FetchMock>>(async () =>
      jsonResponse({
        status: "success",
        message: "Hosted Link",
        data: {
          link: "https://checkout.flutterwave.com/v3/hosted/pay/flwlnk_abc",
        },
      })
    );
    const provider = new FlutterwaveProvider({
      secretKey: SECRET,
      baseUrl: "https://api.example.com/v3",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const result = await provider.initialize(baseInput);

    expect(result).toEqual({
      provider: "flutterwave",
      reference: "bk_ref_1",
      authorizationUrl: "https://checkout.flutterwave.com/v3/hosted/pay/flwlnk_abc",
      accessCode: "flwlnk_abc",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.example.com/v3/payments");
    expect(init?.method).toBe("POST");
    const headers = init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${SECRET}`);
    const body = JSON.parse(init?.body as string);
    expect(body).toMatchObject({
      tx_ref: "bk_ref_1",
      amount: 15_000,
      currency: "NGN",
      redirect_url: baseInput.callbackUrl,
      customer: { email: "guest@example.com" },
      meta: { platform_split_percentage: 12 },
      subaccounts: [
        {
          id: "RS_tenant",
          transaction_charge_type: "percentage",
          transaction_charge: 12,
        },
      ],
    });
  });

  it("verifies a successful charge and surfaces the configured split percentage", async () => {
    const fetchImpl = vi.fn<Parameters<FetchMock>, ReturnType<FetchMock>>(async () =>
      jsonResponse({
        status: "success",
        data: {
          status: "successful",
          tx_ref: "bk_ref_1",
          amount: 15_000,
          charged_amount: 15_000,
          currency: "NGN",
          created_at: "2026-09-16T12:00:00.000Z",
          subaccounts: [{ id: "RS_tenant" }],
          meta: { platform_split_percentage: 12 },
        },
      })
    );
    const provider = new FlutterwaveProvider({
      secretKey: SECRET,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const result = await provider.verify({ reference: "bk_ref_1" });
    expect(result.status).toBe("success");
    expect(result.amountCents).toBe(15_000_00);
    expect(result.subaccountCode).toBe("RS_tenant");
    expect(result.platformSplitPercentage).toBe(12);
    expect(result.paidAt?.toISOString()).toBe("2026-09-16T12:00:00.000Z");
    expect(fetchImpl.mock.calls[0][0]).toBe(
      "https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=bk_ref_1"
    );
  });

  it("does not include the secret key in PaymentProviderError messages", async () => {
    const fetchImpl = vi.fn<Parameters<FetchMock>, ReturnType<FetchMock>>(async () =>
      jsonResponse({ status: "error", message: `bad key ${SECRET}` }, { status: 401 })
    );
    const provider = new FlutterwaveProvider({
      secretKey: SECRET,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await expect(provider.initialize(baseInput)).rejects.toMatchObject({
      name: "PaymentProviderError",
      message: expect.not.stringContaining(SECRET),
    });
    await expect(provider.initialize(baseInput)).rejects.toMatchObject({
      message: expect.stringContaining("[REDACTED]"),
    });
  });

  it("wraps network failures as PaymentProviderError", async () => {
    const fetchImpl = vi.fn<Parameters<FetchMock>, ReturnType<FetchMock>>(async () => {
      throw new Error("ECONNRESET");
    });
    const provider = new FlutterwaveProvider({
      secretKey: SECRET,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(provider.verify({ reference: "x" })).rejects.toBeInstanceOf(PaymentProviderError);
  });
});
