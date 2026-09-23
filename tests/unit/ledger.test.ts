import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { recordPaymentSuccess } from "@/app/lib/ledger";

function createLedgerClient() {
  return {
    ledgerEntry: {
      create: vi.fn(),
      findUnique: vi.fn(),
    },
  };
}

describe("recordPaymentSuccess", () => {
  it("creates an immutable credit entry using the provider reference", async () => {
    const client = createLedgerClient();
    const entry = { id: "ledger-1", reference: "payment:paystack:charge-1" };
    client.ledgerEntry.create.mockResolvedValue(entry);
    const paidAt = new Date("2026-09-23T12:00:00.000Z");

    await expect(
      recordPaymentSuccess(
        {
          tenantId: "tenant-1",
          amountKobo: 10_000,
          providerFeeKobo: 150,
          platformFeeKobo: 50,
          currency: "ngn",
          provider: "paystack",
          providerReference: "charge-1",
          paidAt,
        },
        client,
      ),
    ).resolves.toEqual(entry);

    expect(client.ledgerEntry.create).toHaveBeenCalledWith({
      data: {
        tenantId: "tenant-1",
        direction: "credit",
        entryType: "payment",
        grossKobo: 10_000,
        providerFeeKobo: 150,
        platformFeeKobo: 50,
        netKobo: 9_800,
        currency: "NGN",
        provider: "paystack",
        providerRef: "charge-1",
        reference: "payment:paystack:charge-1",
        occurredAt: paidAt,
      },
    });
    expect(client.ledgerEntry.findUnique).not.toHaveBeenCalled();
  });

  it("returns the existing entry when a provider retries a successful callback", async () => {
    const client = createLedgerClient();
    const duplicate = new Prisma.PrismaClientKnownRequestError("duplicate", {
      code: "P2002",
      clientVersion: "test",
    });
    const entry = { id: "ledger-1", reference: "payment:paystack:charge-1" };
    client.ledgerEntry.create.mockRejectedValue(duplicate);
    client.ledgerEntry.findUnique.mockResolvedValue(entry);

    await expect(
      recordPaymentSuccess(
        {
          tenantId: "tenant-1",
          amountKobo: 10_000,
          currency: "NGN",
          provider: "paystack",
          providerReference: "charge-1",
        },
        client,
      ),
    ).resolves.toEqual(entry);

    expect(client.ledgerEntry.findUnique).toHaveBeenCalledWith({
      where: { reference: "payment:paystack:charge-1" },
    });
  });

  it("rejects impossible money values before writing a ledger entry", async () => {
    const client = createLedgerClient();

    await expect(
      recordPaymentSuccess(
        {
          tenantId: "tenant-1",
          amountKobo: 100,
          providerFeeKobo: 101,
          currency: "NGN",
          provider: "paystack",
          providerReference: "charge-1",
        },
        client,
      ),
    ).rejects.toThrow("payment fees cannot exceed the payment amount");

    expect(client.ledgerEntry.create).not.toHaveBeenCalled();
  });
});
