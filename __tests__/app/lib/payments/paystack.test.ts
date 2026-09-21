import { describe, it, expect, vi } from "vitest";

import { PaystackProvider } from "@/app/lib/payments/paystack";
import { FakePaymentProvider } from "@/app/lib/payments/fake";
import { PaymentProviderError } from "@/app/lib/payments/provider";

function jsonResponse(body: unknown, init: { status?: number } = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json" },
  });
}

type FetchMock = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const SECRET = "sk_test_abcdefghijklmnopqrstuvwxyz123456";

const baseInput = {
  amountCents: 15_000_00,
  currency: "NGN",
  email: "guest@example.com",
  reference: "bk_ref_1",
  callbackUrl: "https://app.example/api/payments/verify",
  subaccountCode: "ACCT_tenant",
  platformSplitPercentage: 12,
};

describe("PaystackProvider", () => {
  it("requires a secretKey", () => {
    expect(() => new PaystackProvider({ secretKey: "" })).toThrow(/secretKey/);
  });

  it("POSTs /transaction/initialize with split metadata and returns checkout fields", async () => {
    const fetchImpl = vi.fn<Parameters<FetchMock>, ReturnType<FetchMock>>(async () =>
      jsonResponse({
        status: true,
        data: {
          authorization_url: "https://checkout.paystack.com/abc",
          access_code: "access_abc",
          reference: "bk_ref_1",
        },
      })
    );
    const provider = new PaystackProvider({
      secretKey: SECRET,
      baseUrl: "https://api.example.com",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const result = await provider.initialize(baseInput);

    expect(result).toEqual({
      provider: "paystack",
      reference: "bk_ref_1",
      authorizationUrl: "https://checkout.paystack.com/abc",
      accessCode: "access_abc",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.example.com/transaction/initialize");
    expect(init?.method).toBe("POST");
    const headers = init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${SECRET}`);
    const body = JSON.parse(init?.body as string);
    expect(body).toMatchObject({
      email: "guest@example.com",
      amount: 15_000_00,
      currency: "NGN",
      reference: "bk_ref_1",
      callback_url: baseInput.callbackUrl,
      subaccount: "ACCT_tenant",
      metadata: { platform_split_percentage: 12 },
    });
  });

  it("verifies a successful charge and surfaces the configured split percentage", async () => {
    const fetchImpl = vi.fn<Parameters<FetchMock>, ReturnType<FetchMock>>(async () =>
      jsonResponse({
        status: true,
        data: {
          status: "success",
          reference: "bk_ref_1",
          amount: 15_000_00,
          currency: "NGN",
          paid_at: "2026-09-16T12:00:00.000Z",
          subaccount: "ACCT_tenant",
          metadata: { platform_split_percentage: 12 },
        },
      })
    );
    const provider = new PaystackProvider({
      secretKey: SECRET,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const result = await provider.verify({ reference: "bk_ref_1" });
    expect(result.status).toBe("success");
    expect(result.amountCents).toBe(15_000_00);
    expect(result.subaccountCode).toBe("ACCT_tenant");
    expect(result.platformSplitPercentage).toBe(12);
    expect(result.paidAt?.toISOString()).toBe("2026-09-16T12:00:00.000Z");
    expect(fetchImpl.mock.calls[0][0]).toBe("https://api.paystack.co/transaction/verify/bk_ref_1");
  });

  it("does not include the secret key in PaymentProviderError messages", async () => {
    const fetchImpl = vi.fn<Parameters<FetchMock>, ReturnType<FetchMock>>(async () =>
      jsonResponse({ status: false, message: `bad key ${SECRET}` }, { status: 401 })
    );
    const provider = new PaystackProvider({
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
    const provider = new PaystackProvider({
      secretKey: SECRET,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(provider.verify({ reference: "x" })).rejects.toBeInstanceOf(PaymentProviderError);
  });
});

describe("FakePaymentProvider", () => {
  it("initializes and verifies a test-mode success path", async () => {
    const fake = new FakePaymentProvider();
    const init = await fake.initialize(baseInput);
    expect(init.provider).toBe("fake");
    expect(init.authorizationUrl).toContain("bk_ref_1");

    fake.succeed("bk_ref_1", new Date("2026-09-16T12:00:00.000Z"));
    const verified = await fake.verify({ reference: "bk_ref_1" });
    expect(verified.status).toBe("success");
    expect(verified.platformSplitPercentage).toBe(12);
    expect(verified.subaccountCode).toBe("ACCT_tenant");
  });

  it("records failed charges for slot-release flows", async () => {
    const fake = new FakePaymentProvider();
    await fake.initialize(baseInput);
    fake.fail("bk_ref_1");
    const verified = await fake.verify({ reference: "bk_ref_1" });
    expect(verified.status).toBe("failed");
    expect(verified.paidAt).toBeNull();
  });
});
