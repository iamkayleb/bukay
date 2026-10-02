import { describe, expect, it, vi } from "vitest";

import { FlutterwavePaymentProvider } from "@/app/lib/payments/flutterwave";
import { recordPaymentSuccess } from "@/app/lib/ledger";
import { PaystackPaymentProvider } from "@/app/lib/payments/paystack";
import type { PaymentProvider } from "@/app/lib/payments/provider";

const jsonResponse = (body: unknown) =>
  new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });

type ProviderFactory = {
  name: string;
  create(): PaymentProvider;
};

type LedgerWrite = {
  tenantId: string;
  direction: "credit" | "debit";
  entryType: "payment" | "refund" | "payout";
  grossKobo: number;
  providerFeeKobo: number;
  platformFeeKobo: number;
  netKobo: number;
  currency: string;
  provider: string;
  providerRef: string;
  relatedPaymentRef?: string;
  reference: string;
  occurredAt?: Date;
};

const providers: ProviderFactory[] = [
  {
    name: "paystack",
    create() {
      const request = vi.fn((input: RequestInfo | URL) => {
        const url = input.toString();
        if (url.includes("/transaction/initialize")) {
          return Promise.resolve(
            jsonResponse({
              status: true,
              data: { reference: "booking-1", authorization_url: "https://paystack.test/pay" },
            })
          );
        }
        if (url.includes("/transaction/verify/")) {
          return Promise.resolve(
            jsonResponse({
              status: true,
              data: {
                reference: "booking-1",
                status: "success",
                amount: 5_000,
                currency: "NGN",
                paid_at: "2026-10-02T12:00:00.000Z",
              },
            })
          );
        }
        return Promise.resolve(
          jsonResponse({ status: true, data: { subaccount_code: "ACCT_1", percentage_charge: 35 } })
        );
      }) as unknown as typeof fetch;
      return new PaystackPaymentProvider("test-key", request);
    },
  },
  {
    name: "flutterwave",
    create() {
      const request = vi.fn((input: RequestInfo | URL) => {
        const url = input.toString();
        if (url.endsWith("/payments")) {
          return Promise.resolve(
            jsonResponse({ status: "success", data: { link: "https://flutterwave.test/pay" } })
          );
        }
        if (url.includes("verify_by_reference")) {
          return Promise.resolve(
            jsonResponse({
              status: "success",
              data: {
                tx_ref: "booking-1",
                status: "successful",
                amount: "50",
                currency: "NGN",
                created_at: "2026-10-02T12:00:00.000Z",
              },
            })
          );
        }
        return Promise.resolve(
          jsonResponse({ status: "success", data: { subaccount_id: "ACCT_1", split_value: 0.35 } })
        );
      }) as unknown as typeof fetch;
      return new FlutterwavePaymentProvider("test-key", request);
    },
  },
];

describe.each(providers)("$name payment-provider contract", ({ create }) => {
  it("returns the shared initialized-payment shape", async () => {
    const payment = await create().initialize({
      reference: "booking-1",
      amountCents: 5_000,
      currency: "NGN",
      customerEmail: "ada@example.test",
      callbackUrl: "https://bukay.test/payments/complete",
      metadata: { tenantId: "tenant-1" },
    });

    expect(payment).toEqual({
      reference: "booking-1",
      authorizationUrl: expect.stringMatching(/^https:\/\//),
    });
  });

  it("normalizes verified payments to minor units and common statuses", async () => {
    await expect(create().verify("booking-1")).resolves.toEqual({
      reference: "booking-1",
      status: "succeeded",
      amountCents: 5_000,
      currency: "NGN",
      paidAt: new Date("2026-10-02T12:00:00.000Z"),
    });
  });

  it("returns the shared subaccount shape", async () => {
    await expect(
      create().createSubaccount({
        businessName: "Bukay",
        settlementBank: "058",
        accountNumber: "0123456789",
        percentageCharge: 35,
      })
    ).resolves.toEqual({ code: "ACCT_1", percentageCharge: 35 });
  });
});

describe("payment-provider ledger contract", () => {
  it("keeps existing ledger rows and writes the same normalized shape after a provider switch", async () => {
    const writes: LedgerWrite[] = [];
    const ledgerClient = {
      ledgerEntry: {
        async create({ data }: { data: LedgerWrite }) {
          writes.push(data);
          return { id: `ledger-${writes.length}`, reference: data.reference };
        },
        async findUnique() {
          return null;
        },
      },
    };

    for (const { name, create } of providers) {
      const payment = await create().verify("booking-1");
      await recordPaymentSuccess(
        {
          tenantId: "tenant-1",
          amountKobo: payment.amountCents,
          currency: payment.currency,
          provider: name,
          providerReference: payment.reference,
          paidAt: payment.paidAt,
        },
        ledgerClient
      );
    }

    expect(writes).toHaveLength(2);
    expect(writes[0]).toMatchObject({
      provider: "paystack",
      reference: "payment:paystack:booking-1",
    });
    expect(writes[1]).toMatchObject({
      provider: "flutterwave",
      reference: "payment:flutterwave:booking-1",
    });

    const [paystackWrite, flutterwaveWrite] = writes.map(
      ({ provider, providerRef, reference, ...sharedShape }) => sharedShape
    );
    expect(flutterwaveWrite).toEqual(paystackWrite);
  });
});
