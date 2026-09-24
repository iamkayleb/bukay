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

export type RecordRefundInput = {
  tenantId: string;
  amountKobo: number;
  currency: string;
  provider: string;
  refundReference: string;
  paymentReference: string;
  occurredAt: Date;
};

export type RecordPayoutInput = {
  tenantId: string;
  amountKobo: number;
  currency: string;
  provider: string;
  payoutReference: string;
  occurredAt: Date;
};

function requiredValue(value: string | undefined, field: string): string {
  if (typeof value !== "string") {
    throw new Error(`${field} is required`);
  }
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`${field} is required`);
  }
  return normalized;
}

function requiredDate(value: Date | undefined, field: string): Date {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new Error(`${field} is required and must be a valid date`);
  }
  return value;
}

function nonNegativeKobo(value: number | undefined, field: string): number {
  if (value === undefined) {
    throw new Error(`${field} is required`);
  }
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

/**
 * Records a provider refund as one immutable debit entry.
 *
 * The refund reference is the idempotency key, while the payment reference is
 * retained to make the reversal traceable to its original charge.
 */
export async function recordRefund(
  input: RecordRefundInput,
  client: LedgerClient = prisma
): Promise<LedgerEntry> {
  const tenantId = requiredValue(input.tenantId, "tenantId");
  const provider = requiredValue(input.provider, "provider");
  const refundReference = requiredValue(input.refundReference, "refundReference");
  const paymentReference = requiredValue(input.paymentReference, "paymentReference");
  const currency = requiredValue(input.currency, "currency").toUpperCase();
  const grossKobo = nonNegativeKobo(input.amountKobo, "amountKobo");
  const occurredAt = requiredDate(input.occurredAt, "occurredAt");
  const reference = `refund:${provider}:${refundReference}`;

  try {
    return await client.ledgerEntry.create({
      data: {
        tenantId,
        direction: "debit",
        entryType: "refund",
        grossKobo,
        providerFeeKobo: 0,
        platformFeeKobo: 0,
        netKobo: -grossKobo,
        currency,
        provider,
        providerRef: refundReference,
        relatedPaymentRef: paymentReference,
        reference,
        occurredAt,
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

/**
 * Records a provider payout as one immutable debit entry.
 *
 * The provider payout reference is the idempotency key, so a delivered-again
 * payout notification returns the original entry instead of creating another
 * withdrawal from the ledger.
 */
export async function recordPayout(
  input: RecordPayoutInput,
  client: LedgerClient = prisma
): Promise<LedgerEntry> {
  const tenantId = requiredValue(input.tenantId, "tenantId");
  const provider = requiredValue(input.provider, "provider");
  const payoutReference = requiredValue(input.payoutReference, "payoutReference");
  const currency = requiredValue(input.currency, "currency").toUpperCase();
  const grossKobo = nonNegativeKobo(input.amountKobo, "amountKobo");
  const occurredAt = requiredDate(input.occurredAt, "occurredAt");
  const reference = `payout:${provider}:${payoutReference}`;

  try {
    return await client.ledgerEntry.create({
      data: {
        tenantId,
        direction: "debit",
        entryType: "payout",
        grossKobo,
        providerFeeKobo: 0,
        platformFeeKobo: 0,
        netKobo: -grossKobo,
        currency,
        provider,
        providerRef: payoutReference,
        reference,
        occurredAt,
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
