import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ ledgerEntries: [] as Array<Record<string, unknown>> }));

vi.mock("@/app/db/prisma", () => ({
  prisma: {
    ledgerEntry: {
      create: vi.fn(async (args: { data: Record<string, unknown> }) => {
        const entry = { id: `ledger-${state.ledgerEntries.length}`, ...args.data };
        state.ledgerEntries.push(entry);
        return entry;
      }),
    },
  },
}));

import { recordPaymentSuccess } from "@/app/lib/ledger";
import { FlutterwavePaymentProvider } from "@/app/lib/payments/flutterwave";
import { PaystackPaymentProvider } from "@/app/lib/payments/paystack";
import { getPaymentProvider } from "@/app/lib/payments";
import { PaymentProviderError, type PaymentProvider } from "@/app/lib/payments/provider";

type Fetch = typeof fetch;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

type Case = {
  name: string;
  make: (request: Fetch) => PaymentProvider;
  ok: {
    initialize: unknown;
    verifySuccess: unknown;
    verifyFailed: unknown;
    verifyPending: unknown;
    subaccount: unknown;
  };
  failure: unknown;
};

const cases: Case[] = [
  {
    name: "paystack",
    make: (request) => new PaystackPaymentProvider("sk_test", request),
    ok: {
      initialize: {
        status: true,
        data: { authorization_url: "https://pay.example/auth", reference: "ref-1" },
      },
      verifySuccess: {
        status: true,
        data: {
          status: "success",
          reference: "ref-1",
          amount: 500000,
          currency: "NGN",
          paid_at: "2026-10-01T10:00:00.000Z",
        },
      },
      verifyFailed: {
        status: true,
        data: {
          status: "failed",
          reference: "ref-1",
          amount: 500000,
          currency: "NGN",
          paid_at: null,
        },
      },
      verifyPending: {
        status: true,
        data: {
          status: "ongoing",
          reference: "ref-1",
          amount: 500000,
          currency: "NGN",
          paid_at: null,
        },
      },
      subaccount: { status: true, data: { subaccount_code: "ACCT_1", percentage_charge: 10 } },
    },
    failure: { status: false, message: "nope" },
  },
  {
    name: "flutterwave",
    make: (request) => new FlutterwavePaymentProvider("flw_test", request),
    ok: {
      initialize: { status: "success", data: { link: "https://pay.example/auth" } },
      verifySuccess: {
        status: "success",
        data: {
          status: "successful",
          tx_ref: "ref-1",
          amount: 5000,
          currency: "NGN",
          created_at: "2026-10-01T10:00:00.000Z",
        },
      },
      verifyFailed: {
        status: "success",
        data: { status: "failed", tx_ref: "ref-1", amount: 5000, currency: "NGN" },
      },
      verifyPending: {
        status: "success",
        data: { status: "pending", tx_ref: "ref-1", amount: 5000, currency: "NGN" },
      },
      subaccount: { status: "success", data: { subaccount_id: "RS_1" } },
    },
    failure: { status: "error", message: "nope" },
  },
];

const initInput = {
  reference: "ref-1",
  amount: 500000,
  currency: "NGN",
  customer: { email: "a@example.com" },
  callbackUrl: "https://app.example/cb",
};

beforeEach(() => {
  state.ledgerEntries = [];
});

describe.each(cases)("PaymentProvider contract: $name", (c) => {
  const provider = (body: unknown, status = 200) => {
    const request = vi.fn(async () => json(body, status)) as unknown as Fetch;
    return c.make(request);
  };

  it("reports its name and is resolvable by name", () => {
    const p = provider(c.ok.initialize);
    expect(p.name).toBe(c.name);
    expect(getPaymentProvider(c.name)?.name).toBe(c.name);
  });

  it("initializes a payment with the caller's reference", async () => {
    const result = await provider(c.ok.initialize).initialize(initInput);
    expect(result).toEqual({
      provider: c.name,
      reference: "ref-1",
      authorizationUrl: "https://pay.example/auth",
    });
  });

  it("verifies in minor units with a normalised status", async () => {
    const ok = await provider(c.ok.verifySuccess).verify("ref-1");
    expect(ok).toEqual({
      provider: c.name,
      reference: "ref-1",
      status: "success",
      amount: 500000,
      currency: "NGN",
      paidAt: new Date("2026-10-01T10:00:00.000Z"),
    });
    expect((await provider(c.ok.verifyFailed).verify("ref-1")).status).toBe("failed");
    const pending = await provider(c.ok.verifyPending).verify("ref-1");
    expect(pending.status).toBe("pending");
    expect(pending.paidAt).toBeNull();
  });

  it("creates a subaccount and echoes the percentage charge", async () => {
    const result = await provider(c.ok.subaccount).createSubaccount({
      name: "Salon",
      settlementBank: "044",
      accountNumber: "0123456789",
      percentageCharge: 10,
      currency: "NGN",
    });
    expect(result.provider).toBe(c.name);
    expect(result.code).toBeTruthy();
    expect(result.percentageCharge).toBe(10);
  });

  it("wraps failures in PaymentProviderError", async () => {
    await expect(provider(c.failure, 400).verify("ref-1")).rejects.toBeInstanceOf(
      PaymentProviderError
    );
    const throwing = c.make((async () => {
      throw new Error("network");
    }) as unknown as Fetch);
    await expect(throwing.initialize(initInput)).rejects.toMatchObject({ provider: c.name });
  });

  it("does not call the network without credentials", async () => {
    const request = vi.fn() as unknown as Fetch;
    const p =
      c.name === "paystack"
        ? new PaystackPaymentProvider("", request)
        : new FlutterwavePaymentProvider("", request);
    await expect(p.verify("ref-1")).rejects.toBeInstanceOf(PaymentProviderError);
    expect(request).not.toHaveBeenCalled();
  });
});

describe("ledger writes across adapters", () => {
  it("have identical shape regardless of provider", async () => {
    for (const c of cases) {
      const request = vi.fn(async () => json(c.ok.verifySuccess)) as unknown as Fetch;
      const v = await c.make(request).verify("ref-1");
      await recordPaymentSuccess({
        tenantId: "t1",
        paymentId: "p1",
        bookingId: "b1",
        amountCents: v.amount,
        currency: v.currency,
        sourceRef: v.reference,
      });
    }
    const [a, b] = state.ledgerEntries;
    expect(state.ledgerEntries).toHaveLength(2);
    expect(Object.keys(a).sort()).toEqual(Object.keys(b).sort());
    const { id: _a, ...restA } = a;
    const { id: _b, ...restB } = b;
    expect(restA).toEqual(restB);
  });
});
