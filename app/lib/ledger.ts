import { prisma } from "@/app/db/prisma";

/**
 * The full set of LedgerEntry.type values. Stored as a plain string in the
 * database (see prisma/schema.prisma) because the sqlite connector does not
 * support Prisma enums.
 */
export type LedgerEntryType = "payment_success" | "refund" | "payout" | "no_show_fee";

export type LedgerEntryRow = {
  id: string;
  tenantId: string;
  bookingId: string | null;
  paymentId: string | null;
  type: string;
  amountCents: number;
  currency: string;
  sourceRef: string;
  notes: string | null;
  createdAt: Date;
};

const ledgerEntryDelegate = (
  prisma as unknown as {
    ledgerEntry: {
      create(args: unknown): Promise<LedgerEntryRow>;
    };
  }
).ledgerEntry;

type AppendLedgerEntryInput = {
  tenantId: string;
  type: LedgerEntryType;
  amountCents: number;
  currency: string;
  sourceRef: string;
  bookingId?: string | null;
  paymentId?: string | null;
  notes?: string | null;
};

/**
 * Inserts a new LedgerEntry row. This never updates or deletes an existing
 * row — the append-only trigger migration
 * (prisma/migrations/20260924134058_ledger_entry_append_only_trigger)
 * rejects UPDATE/DELETE against LedgerEntry at the database level, so every
 * writer in this module, including corrections, must append a new row
 * instead of mutating a prior one.
 */
async function appendLedgerEntry(input: AppendLedgerEntryInput): Promise<LedgerEntryRow> {
  return ledgerEntryDelegate.create({
    data: {
      tenantId: input.tenantId,
      bookingId: input.bookingId ?? null,
      paymentId: input.paymentId ?? null,
      type: input.type,
      amountCents: input.amountCents,
      currency: input.currency,
      sourceRef: input.sourceRef,
      notes: input.notes ?? null,
    },
  });
}

export type RecordPaymentSuccessInput = {
  tenantId: string;
  paymentId: string;
  bookingId?: string | null;
  amountCents: number;
  currency: string;
  /** Dedup key for the originating event, e.g. the provider payment reference. */
  sourceRef: string;
  notes?: string | null;
};

/** Appends a LedgerEntry recording a successful payment capture. */
export async function recordPaymentSuccess(
  input: RecordPaymentSuccessInput
): Promise<LedgerEntryRow> {
  return appendLedgerEntry({
    tenantId: input.tenantId,
    type: "payment_success",
    amountCents: input.amountCents,
    currency: input.currency,
    sourceRef: input.sourceRef,
    bookingId: input.bookingId,
    paymentId: input.paymentId,
    notes: input.notes,
  });
}

export type RecordRefundInput = {
  tenantId: string;
  paymentId: string;
  bookingId?: string | null;
  /** Positive magnitude of the amount refunded. */
  amountCents: number;
  currency: string;
  /** Dedup key for the originating event, e.g. the provider refund reference. */
  sourceRef: string;
  notes?: string | null;
};

/** Appends a LedgerEntry recording a refund issued against a payment. */
export async function recordRefund(input: RecordRefundInput): Promise<LedgerEntryRow> {
  return appendLedgerEntry({
    tenantId: input.tenantId,
    type: "refund",
    amountCents: input.amountCents,
    currency: input.currency,
    sourceRef: input.sourceRef,
    bookingId: input.bookingId,
    paymentId: input.paymentId,
    notes: input.notes,
  });
}

export type RecordPayoutInput = {
  tenantId: string;
  /** Positive magnitude of the amount paid out to the tenant. */
  amountCents: number;
  currency: string;
  /** Dedup key for the originating event, e.g. the provider payout reference. */
  sourceRef: string;
  notes?: string | null;
};

/**
 * Appends a LedgerEntry recording a payout to the tenant. Payouts are not
 * tied to a single Payment or Booking row (a payout typically settles many
 * bookings at once), so bookingId/paymentId are always null here — the
 * payout is identified solely by its provider reference in sourceRef.
 */
export async function recordPayout(input: RecordPayoutInput): Promise<LedgerEntryRow> {
  return appendLedgerEntry({
    tenantId: input.tenantId,
    type: "payout",
    amountCents: input.amountCents,
    currency: input.currency,
    sourceRef: input.sourceRef,
    bookingId: null,
    paymentId: null,
    notes: input.notes,
  });
}
