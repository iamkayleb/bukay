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

export type NoShowFeeTransaction = {
  booking: {
    update(args: { where: { id: string }; data: { status: "no_show" } }): Promise<unknown>;
  };
  ledgerEntry: {
    create(args: {
      data: {
        tenantId: string;
        direction: "credit";
        entryType: "no_show_fee";
        grossKobo: number;
        providerFeeKobo: number;
        platformFeeKobo: number;
        netKobo: number;
        currency: string;
        reference: string;
      };
    }): Promise<unknown>;
  };
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

/**
 * Records a forfeited deposit as immutable revenue and marks the booking as a
 * no-show. Call this inside the surrounding database transaction so either
 * both writes succeed or neither does.
 */
export async function writeNoShowFeeRecord(
  transaction: NoShowFeeTransaction,
  input: NoShowFeeInput
): Promise<NoShowFeeResult> {
  const amountCents = calculateNoShowFeeCents(input.priceCents, input.depositCents);
  if (amountCents <= 0) {
    throw new Error("Booking has no deposit to forfeit");
  }

  const ledgerReference = `no-show:${input.bookingId}`;
  await transaction.ledgerEntry.create({
    data: {
      tenantId: input.tenantId,
      direction: "credit",
      entryType: "no_show_fee",
      grossKobo: amountCents,
      providerFeeKobo: 0,
      platformFeeKobo: 0,
      netKobo: amountCents,
      currency: input.currency,
      reference: ledgerReference,
    },
  });
  await transaction.booking.update({
    where: { id: input.bookingId },
    data: { status: "no_show" },
  });

  return { amountCents, bookingStatus: "no_show", ledgerReference };
}
