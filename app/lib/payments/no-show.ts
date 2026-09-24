import { prisma } from "@/app/db/prisma";

type PaymentRow = {
  id: string;
  tenantId: string;
  bookingId: string;
  kind: string;
  amountCents: number;
  currency: string;
  status: string;
};

type BookingRow = {
  id: string;
  tenantId: string;
  status: string;
};

type LedgerEntryRow = {
  id: string;
  tenantId: string;
  bookingId: string | null;
  paymentId: string | null;
  type: string;
  amountCents: number;
  currency: string;
  sourceRef: string;
  notes: string | null;
};

const paymentDelegate = prisma.payment as unknown as {
  findFirst(args: unknown): Promise<PaymentRow | null>;
};
const bookingDelegate = prisma.booking as unknown as {
  update(args: unknown): Promise<BookingRow>;
};
const ledgerEntryDelegate = (
  prisma as unknown as {
    ledgerEntry: {
      create(args: unknown): Promise<LedgerEntryRow>;
    };
  }
).ledgerEntry;

export type ChargeNoShowFeeInput = {
  tenantId: string;
  bookingId: string;
};

export type ChargeNoShowFeeResult = {
  booking: BookingRow;
  ledgerEntry: LedgerEntryRow;
};

/**
 * Charges the no-show fee for a booking. The deposit the client already
 * paid is forfeited as the fee — no new payment provider charge is made,
 * this only records the forfeiture as a LedgerEntry and marks the booking
 * "no_show".
 */
export async function chargeNoShowFee(
  input: ChargeNoShowFeeInput
): Promise<ChargeNoShowFeeResult | null> {
  const { tenantId, bookingId } = input;

  const deposit = await paymentDelegate.findFirst({
    where: { tenantId, bookingId, kind: "deposit", status: "success" },
  });
  if (!deposit) {
    return null;
  }

  const booking = await bookingDelegate.update({
    where: { id: bookingId, tenantId },
    data: { status: "no_show" },
  });

  const ledgerEntry = await ledgerEntryDelegate.create({
    data: {
      tenantId,
      bookingId,
      paymentId: deposit.id,
      type: "no_show_fee",
      amountCents: deposit.amountCents,
      currency: deposit.currency,
      // Dedups against the forfeited deposit — one no-show fee per deposit.
      sourceRef: deposit.id,
      notes: `Deposit forfeited for no-show on booking ${bookingId}`,
    },
  });

  return { booking, ledgerEntry };
}
