import type { VerifyPaymentResult } from "@/app/lib/payments/provider";

/**
 * Canonical ledger row shape written after a successful verification.
 * Both Paystack and Flutterwave adapters (via writeLedgerEntryFromVerification)
 * must produce identical field sets so provider switches never fork history.
 */
export type LedgerEntryWrite = {
  tenantId: string;
  paymentId?: string | null;
  bookingId?: string | null;
  provider: string;
  direction: "credit" | "debit";
  grossCents: number;
  providerFeeCents: number;
  platformFeeCents: number;
  netCents: number;
  currency: string;
  reference: string | null;
};

export type LedgerEntryWriter = {
  ledgerEntry: {
    create(args: { data: LedgerEntryWrite }): Promise<unknown>;
  };
};

export type LedgerSplitInput = {
  tenantId: string;
  paymentId?: string | null;
  bookingId?: string | null;
  /** Optional explicit provider fee in minor units; defaults to 0. */
  providerFeeCents?: number;
};

/**
 * Build the shared ledger write payload from a VerifyPaymentResult.
 * Platform fee is derived from platformSplitPercentage when present.
 */
export function ledgerEntryFromVerification(
  verified: VerifyPaymentResult,
  input: LedgerSplitInput
): LedgerEntryWrite {
  const grossCents = Math.trunc(verified.amountCents);
  const providerFeeCents = Math.trunc(input.providerFeeCents ?? 0);
  const split =
    verified.platformSplitPercentage != null && Number.isFinite(verified.platformSplitPercentage)
      ? verified.platformSplitPercentage
      : 0;
  const platformFeeCents = Math.trunc(Math.round((grossCents * split) / 100));
  const netCents = grossCents - providerFeeCents - platformFeeCents;

  return {
    tenantId: input.tenantId,
    paymentId: input.paymentId ?? null,
    bookingId: input.bookingId ?? null,
    provider: verified.provider,
    direction: "credit",
    grossCents,
    providerFeeCents,
    platformFeeCents,
    netCents,
    currency: verified.currency,
    reference: verified.reference,
  };
}

/** Persist a ledger row from a successful verification (identical for every adapter). */
export async function writeLedgerEntryFromVerification(
  db: LedgerEntryWriter,
  verified: VerifyPaymentResult,
  input: LedgerSplitInput
): Promise<LedgerEntryWrite> {
  if (verified.status !== "success") {
    throw new Error(`Cannot write ledger entry for status ${verified.status}`);
  }
  const data = ledgerEntryFromVerification(verified, input);
  await db.ledgerEntry.create({ data });
  return data;
}
