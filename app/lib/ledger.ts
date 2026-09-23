import { Prisma } from "@prisma/client";

import { prisma } from "@/app/db/prisma";

type LedgerEntry = {
  id: string;
  reference: string;
};

type LedgerClient = {
  ledgerEntry: {
    create(args: {
      data: {
        tenantId: string;
        direction: "credit";
        entryType: "payment";
        grossKobo: number;
        providerFeeKobo: number;
        platformFeeKobo: number;
        netKobo: number;
        currency: string;
        provider: string;
        providerRef: string;
        reference: string;
        occurredAt?: Date;
      };
    }): Promise<LedgerEntry>;
    findUnique(args: { where: { reference: string } }): Promise<LedgerEntry | null>;
  };
};

export type RecordPaymentSuccessInput = {
  tenantId: string;
  amountKobo: number;
  currency: string;
  provider: string;
  providerReference: string;
  paidAt?: Date;
  providerFeeKobo?: number;
  platformFeeKobo?: number;
};

function requiredValue(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`${field} is required`);
  }
  return normalized;
}

function nonNegativeKobo(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${field} must be a non-negative integer number of kobo`);
  }
  return value;
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/**
 * Records a successful provider charge as one immutable credit entry.
 *
 * Payment providers may deliver the same success notification more than once.
 * The provider reference is therefore the ledger idempotency key. Retrying a
 * notification only reads the original entry; it never updates it.
 */
export async function recordPaymentSuccess(
  input: RecordPaymentSuccessInput,
  client: LedgerClient = prisma
): Promise<LedgerEntry> {
  const tenantId = requiredValue(input.tenantId, "tenantId");
  const provider = requiredValue(input.provider, "provider");
  const providerReference = requiredValue(input.providerReference, "providerReference");
  const currency = requiredValue(input.currency, "currency").toUpperCase();
  const grossKobo = nonNegativeKobo(input.amountKobo, "amountKobo");
  const providerFeeKobo = nonNegativeKobo(input.providerFeeKobo ?? 0, "providerFeeKobo");
  const platformFeeKobo = nonNegativeKobo(input.platformFeeKobo ?? 0, "platformFeeKobo");
  const netKobo = grossKobo - providerFeeKobo - platformFeeKobo;
  if (netKobo < 0) {
    throw new Error("payment fees cannot exceed the payment amount");
  }

  const reference = `payment:${provider}:${providerReference}`;
  try {
    return await client.ledgerEntry.create({
      data: {
        tenantId,
        direction: "credit",
        entryType: "payment",
        grossKobo,
        providerFeeKobo,
        platformFeeKobo,
        netKobo,
        currency,
        provider,
        providerRef: providerReference,
        reference,
        ...(input.paidAt ? { occurredAt: input.paidAt } : {}),
      },
    });
  } catch (error) {
    if (!isUniqueConstraintError(error)) {
      throw error;
    }

    const existingEntry = await client.ledgerEntry.findUnique({ where: { reference } });
    if (!existingEntry) {
      throw error;
    }
    return existingEntry;
  }
}
