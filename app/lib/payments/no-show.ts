/**
 * Domain inputs for recording a no-show. A no-show fee is limited to the
 * deposit already collected for the booking; this flow must never initiate a
 * new provider charge.
 */
export type NoShowFeeInput = {
  tenantId: string;
  bookingId: string;
  priceCents: number;
  depositCents: number;
  currency: string;
};

/** The outcome returned after a no-show fee has been recorded. */
export type NoShowFeeResult = {
  amountCents: number;
  bookingStatus: "no_show";
  ledgerReference: string;
};

/**
 * Calculates the fee forfeited when a customer does not attend a booking.
 *
 * The existing deposit is the maximum amount that may be retained. Keeping
 * the calculation separate from persistence makes it possible for the later
 * transaction to validate the booking before writing its immutable ledger
 * entry.
 */
export function calculateNoShowFeeCents(priceCents: number, depositCents: number): number {
  if (!Number.isSafeInteger(priceCents) || priceCents < 0) {
    throw new Error("Service price must be a non-negative integer");
  }
  if (!Number.isSafeInteger(depositCents) || depositCents < 0 || depositCents > priceCents) {
    throw new Error("Deposit amount must not exceed the service price");
  }

  return depositCents;
}
