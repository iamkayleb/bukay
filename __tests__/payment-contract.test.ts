/**
 * Shared PaymentProvider contract suite.
 *
 * Both Paystack and Flutterwave must satisfy the same initialize/verify result
 * shape and produce identical LedgerEntry writes (aside from `provider`).
 */
import { describe, it, expect, vi } from "vitest";

import { FlutterwaveProvider } from "@/app/lib/payments/flutterwave";
import {
  ledgerEntryFromVerification,
  writeLedgerEntryFromVerification,
  type LedgerEntryWrite,
} from "@/app/lib/payments/ledger";
import { PaystackProvider } from "@/app/lib/payments/paystack";
import type {
  InitializePaymentInput,
  PaymentProvider,
  VerifyPaymentResult,
} from "@/app/lib/payments/provider";
import { createPaymentProvider } from "@/app/lib/payments/resolve-provider";

function jsonResponse(body: unknown, init: { status?: number } = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json" },
  });
}

type FetchMock = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const PAYSTACK_SECRET = "sk_test_abcdefghijklmnopqrstuvwxyz123456";
const FLW_SECRET = "FLWSECK_TEST_abcdefghijklmnopqrstuvwxyz123456";

const baseInput: InitializePaymentInput = {
  amountCents: 15_000_00,
  currency: "NGN",
  email: "guest@example.com",
  reference: "bk_contract_1",
  callbackUrl: "https://app.example/api/payments/verify",
  subaccountCode: "SUB_tenant",
  platformSplitPercentage: 12,
  metadata: { tenantId: "tenant-1", bookingId: "book-1" },
};

function shapeOfVerify(result: VerifyPaymentResult) {
  return {
    reference: result.reference,
    status: result.status,
    amountCents: result.amountCents,
    currency: result.currency,
    paidAt: result.paidAt?.toISOString() ?? null,
    platformSplitPercentage: result.platformSplitPercentage ?? null,
    subaccountCode: result.subaccountCode ?? null,
    // provider and providerStatus are adapter-native and compared separately
  };
}

function shapeOfLedger(entry: LedgerEntryWrite) {
  return {
    direction: entry.direction,
    grossCents: entry.grossCents,
    providerFeeCents: entry.providerFeeCents,
    platformFeeCents: entry.platformFeeCents,
    netCents: entry.netCents,
    currency: entry.currency,
  };
}

function identityOfLedger(entry: LedgerEntryWrite) {
  return {
    tenantId: entry.tenantId,
    paymentId: entry.paymentId,
    bookingId: entry.bookingId,
    reference: entry.reference,
    provider: entry.provider,
    ...shapeOfLedger(entry),
  };
}

function paystackProvider(fetchImpl: FetchMock): PaymentProvider {
  return new PaystackProvider({
    secretKey: PAYSTACK_SECRET,
    baseUrl: "https://api.paystack.test",
    fetchImpl: fetchImpl as unknown as typeof fetch,
  });
}

function flutterwaveProvider(fetchImpl: FetchMock): PaymentProvider {
  return new FlutterwaveProvider({
    secretKey: FLW_SECRET,
    baseUrl: "https://api.flutterwave.test/v3",
    fetchImpl: fetchImpl as unknown as typeof fetch,
  });
}

describe("payment contract — initialize + verify", () => {
  it.each([
    {
      name: "paystack",
      build: paystackProvider,
      initUrl: "https://api.paystack.test/transaction/initialize",
      initResponse: {
        status: true,
        data: {
          authorization_url: "https://checkout.paystack.com/abc",
          access_code: "access_abc",
          reference: "bk_contract_1",
        },
      },
      verifyResponse: {
        status: true,
        data: {
          status: "success",
          reference: "bk_contract_1",
          amount: 15_000_00,
          currency: "NGN",
          paid_at: "2026-09-16T12:00:00.000Z",
          subaccount: "SUB_tenant",
          metadata: { platform_split_percentage: 12 },
        },
      },
      providerStatus: "success",
    },
    {
      name: "flutterwave",
      build: flutterwaveProvider,
      initUrl: "https://api.flutterwave.test/v3/payments",
      initResponse: {
        status: "success",
        data: { link: "https://checkout.flutterwave.com/v3/hosted/pay/flwlnk_abc" },
      },
      verifyResponse: {
        status: "success",
        data: {
          status: "successful",
          tx_ref: "bk_contract_1",
          amount: 15_000,
          charged_amount: 15_000,
          currency: "NGN",
          created_at: "2026-09-16T12:00:00.000Z",
          subaccounts: [{ id: "SUB_tenant" }],
          meta: { platform_split_percentage: 12 },
        },
      },
      providerStatus: "successful",
    },
  ] as const)("$name satisfies initialize/verify contract", async (fixture) => {
    const fetchImpl = vi
      .fn<Parameters<FetchMock>, ReturnType<FetchMock>>()
      .mockResolvedValueOnce(jsonResponse(fixture.initResponse))
      .mockResolvedValueOnce(jsonResponse(fixture.verifyResponse));

    const provider = fixture.build(fetchImpl);
    expect(provider.name).toBe(fixture.name);

    const init = await provider.initialize(baseInput);
    expect(init.provider).toBe(fixture.name);
    expect(init.reference).toBe(baseInput.reference);
    expect(init.authorizationUrl).toMatch(/^https:\/\//);
    expect(init.accessCode.length).toBeGreaterThan(0);
    expect(fetchImpl.mock.calls[0][0]).toBe(fixture.initUrl);

    const verified = await provider.verify({ reference: baseInput.reference });
    expect(verified.provider).toBe(fixture.name);
    expect(verified.providerStatus).toBe(fixture.providerStatus);
    expect(shapeOfVerify(verified)).toEqual({
      reference: "bk_contract_1",
      status: "success",
      amountCents: 15_000_00,
      currency: "NGN",
      paidAt: "2026-09-16T12:00:00.000Z",
      platformSplitPercentage: 12,
      subaccountCode: "SUB_tenant",
    });
  });

  it("Paystack and Flutterwave verify results share the same contract shape", async () => {
    const paystackFetch = vi.fn<Parameters<FetchMock>, ReturnType<FetchMock>>(async () =>
      jsonResponse({
        status: true,
        data: {
          status: "success",
          reference: "bk_contract_1",
          amount: 15_000_00,
          currency: "NGN",
          paid_at: "2026-09-16T12:00:00.000Z",
          subaccount: "SUB_tenant",
          metadata: { platform_split_percentage: 12 },
        },
      })
    );
    const flwFetch = vi.fn<Parameters<FetchMock>, ReturnType<FetchMock>>(async () =>
      jsonResponse({
        status: "success",
        data: {
          status: "successful",
          tx_ref: "bk_contract_1",
          amount: 15_000,
          charged_amount: 15_000,
          currency: "NGN",
          created_at: "2026-09-16T12:00:00.000Z",
          subaccounts: [{ id: "SUB_tenant" }],
          meta: { platform_split_percentage: 12 },
        },
      })
    );

    const paystack = await paystackProvider(paystackFetch).verify({ reference: "bk_contract_1" });
    const flutterwave = await flutterwaveProvider(flwFetch).verify({ reference: "bk_contract_1" });

    expect(shapeOfVerify(paystack)).toEqual(shapeOfVerify(flutterwave));
    expect(paystack.provider).not.toBe(flutterwave.provider);
  });
});

describe("payment contract — ledger writes", () => {
  function mockVerified(provider: string): VerifyPaymentResult {
    return {
      provider,
      reference: "bk_contract_1",
      status: "success",
      amountCents: 15_000_00,
      currency: "NGN",
      paidAt: new Date("2026-09-16T12:00:00.000Z"),
      providerStatus: provider === "flutterwave" ? "successful" : "success",
      subaccountCode: "SUB_tenant",
      platformSplitPercentage: 12,
    };
  }

  it("ledger writes from both adapters have identical shape", async () => {
    const created: LedgerEntryWrite[] = [];
    const db = {
      ledgerEntry: {
        create: async ({ data }: { data: LedgerEntryWrite }) => {
          created.push({ ...data });
          return data;
        },
      },
    };

    const split = {
      tenantId: "tenant-1",
      paymentId: "pay-1",
      bookingId: "book-1",
      providerFeeCents: 0,
    };

    const paystackEntry = await writeLedgerEntryFromVerification(
      db,
      mockVerified("paystack"),
      split
    );
    const flwEntry = await writeLedgerEntryFromVerification(db, mockVerified("flutterwave"), split);

    expect(shapeOfLedger(paystackEntry)).toEqual(shapeOfLedger(flwEntry));
    expect(paystackEntry.provider).toBe("paystack");
    expect(flwEntry.provider).toBe("flutterwave");
    expect(paystackEntry.platformFeeCents).toBe(Math.round((15_000_00 * 12) / 100));
    expect(paystackEntry.netCents).toBe(15_000_00 - paystackEntry.platformFeeCents);
    expect(created).toHaveLength(2);
    // Same payment/booking identity aside from provider name.
    expect(identityOfLedger(paystackEntry)).toEqual({
      ...identityOfLedger(flwEntry),
      provider: "paystack",
    });
    expect(identityOfLedger(flwEntry).provider).toBe("flutterwave");
  });

  it("switching provider preserves existing LedgerEntry rows", async () => {
    /** In-memory tenant + ledger store simulating append-only history. */
    const tenant = { id: "tenant-1", paymentProvider: "paystack" as string };
    const ledger: LedgerEntryWrite[] = [];

    const db = {
      ledgerEntry: {
        create: async ({ data }: { data: LedgerEntryWrite }) => {
          ledger.push({ ...data });
          return data;
        },
        findMany: async ({ where }: { where: { tenantId: string } }) =>
          ledger.filter((row) => row.tenantId === where.tenantId).map((row) => ({ ...row })),
      },
    };

    const first = ledgerEntryFromVerification(mockVerified("paystack"), {
      tenantId: tenant.id,
      paymentId: "pay-1",
      bookingId: "book-1",
    });
    await db.ledgerEntry.create({ data: first });
    const snapshot = await db.ledgerEntry.findMany({ where: { tenantId: tenant.id } });

    // Switch tenant adapter selection — must not mutate prior ledger rows.
    tenant.paymentProvider = "flutterwave";
    expect(
      createPaymentProvider(tenant.paymentProvider, {
        NODE_ENV: "test",
        FLUTTERWAVE_SECRET_KEY: FLW_SECRET,
      }).name
    ).toBe("flutterwave");

    const afterSwitch = await db.ledgerEntry.findMany({ where: { tenantId: tenant.id } });
    expect(afterSwitch).toEqual(snapshot);
    expect(afterSwitch[0].provider).toBe("paystack");

    const second = ledgerEntryFromVerification(mockVerified("flutterwave"), {
      tenantId: tenant.id,
      paymentId: "pay-2",
      bookingId: "book-2",
    });
    await db.ledgerEntry.create({ data: second });

    const all = await db.ledgerEntry.findMany({ where: { tenantId: tenant.id } });
    expect(all).toHaveLength(2);
    expect(all[0]).toEqual(snapshot[0]);
    expect(all[1].provider).toBe("flutterwave");
    // Monetary shape stays identical across providers even for distinct bookings.
    expect(shapeOfLedger(all[0])).toEqual(shapeOfLedger(all[1]));
  });
});
