import { prisma } from "@/app/db/prisma";

export type DepositType = "percent" | "flat";

export type DepositConfig = {
  depositType: DepositType | null;
  depositValue: number | null;
};

export type DepositSplit = {
  depositCents: number;
  balanceCents: number;
};

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

const paymentDelegate = prisma.payment as unknown as {
  create(args: unknown): Promise<PaymentRow>;
};
const bookingDelegate = prisma.booking as unknown as {
  update(args: unknown): Promise<BookingRow>;
};

/**
 * Splits a service price into a deposit portion and a balance portion.
 * A null depositType means the deposit covers the full price (no balance
 * owed later).
 */
export function computeDepositSplit(priceCents: number, config: DepositConfig): DepositSplit {
  const { depositType, depositValue } = config;

  if (!depositType || depositValue == null) {
    return { depositCents: priceCents, balanceCents: 0 };
  }

  const depositCents =
    depositType === "percent"
      ? Math.round((priceCents * depositValue) / 100)
      : Math.min(depositValue, priceCents);

  return {
    depositCents,
    balanceCents: priceCents - depositCents,
  };
}

export type RecordDepositInput = {
  tenantId: string;
  bookingId: string;
  priceCents: number;
  currency: string;
  depositType: DepositType | null;
  depositValue: number | null;
  provider?: string | null;
  providerRef?: string | null;
  paidAt?: Date;
};

export type RecordDepositResult = {
  deposit: PaymentRow;
  balance: PaymentRow | null;
  booking: BookingRow;
};

/**
 * Records that a booking's deposit has been paid: writes the deposit
 * Payment row (status "success"), writes a pending balance Payment row when
 * a balance remains, and updates the booking status accordingly.
 * "confirmed_partial" means the deposit is in but a balance is still owed;
 * "confirmed" means the deposit covered the full price.
 */
export async function recordDepositPayment(
  input: RecordDepositInput
): Promise<RecordDepositResult> {
  const { tenantId, bookingId, priceCents, currency } = input;
  const { depositCents, balanceCents } = computeDepositSplit(priceCents, {
    depositType: input.depositType,
    depositValue: input.depositValue,
  });
  const paidAt = input.paidAt ?? new Date();

  const deposit = await paymentDelegate.create({
    data: {
      tenantId,
      bookingId,
      kind: "deposit",
      amountCents: depositCents,
      currency,
      provider: input.provider ?? null,
      providerRef: input.providerRef ?? null,
      status: "success",
      paidAt,
    },
  });

  let balance: PaymentRow | null = null;
  if (balanceCents > 0) {
    balance = await paymentDelegate.create({
      data: {
        tenantId,
        bookingId,
        kind: "balance",
        amountCents: balanceCents,
        currency,
        status: "pending",
      },
    });
  }

  const booking = await bookingDelegate.update({
    where: { id: bookingId, tenantId },
    data: { status: balanceCents > 0 ? "confirmed_partial" : "confirmed" },
  });

  return { deposit, balance, booking };
}
