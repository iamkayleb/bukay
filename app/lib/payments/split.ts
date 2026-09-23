/**
 * The payment rows that make up a booking's total are deliberately written
 * separately. This lets the booking remain confirmed after a deposit without
 * treating the unpaid balance as collected revenue.
 */
export type DepositPolicy = {
  priceCents: number;
  depositType: "none" | "percentage" | "flat";
  depositValue: number;
};

export type DepositPaymentInput = {
  tenantId: string;
  bookingId: string;
  currency: string;
  provider: string;
  providerRef: string;
  paidAt?: Date;
  service: DepositPolicy;
};

type DepositTransaction = {
  payment: {
    create(args: {
      data: {
        tenantId: string;
        bookingId: string;
        amountCents: number;
        currency: string;
        provider: string;
        providerRef: string;
        status: string;
        paidAt: Date;
      };
    }): Promise<unknown>;
  };
  booking: {
    update(args: { where: { id: string }; data: { status: string } }): Promise<unknown>;
  };
};

/** Returns the amount a customer must pay now for a service's deposit policy. */
export function calculateDepositCents({ priceCents, depositType, depositValue }: DepositPolicy) {
  if (!Number.isSafeInteger(priceCents) || priceCents < 0) {
    throw new Error("Service price must be a non-negative integer");
  }
  if (!Number.isSafeInteger(depositValue) || depositValue < 0) {
    throw new Error("Deposit value must be a non-negative integer");
  }

  switch (depositType) {
    case "none":
      return 0;
    case "percentage":
      if (depositValue > 100) throw new Error("Percentage deposit cannot exceed 100");
      return Math.round((priceCents * depositValue) / 100);
    case "flat":
      return Math.min(depositValue, priceCents);
  }
}

/**
 * Persists a successful deposit and leaves the booking confirmed but with an
 * outstanding balance. Call this inside the same transaction as payment
 * verification so a failed booking update cannot leave an orphan payment.
 */
export async function writeDepositRecord(
  transaction: DepositTransaction,
  input: DepositPaymentInput
) {
  const amountCents = calculateDepositCents(input.service);
  if (amountCents <= 0) throw new Error("Service does not require a deposit");

  const paidAt = input.paidAt ?? new Date();
  await transaction.payment.create({
    data: {
      tenantId: input.tenantId,
      bookingId: input.bookingId,
      amountCents,
      currency: input.currency,
      provider: input.provider,
      providerRef: input.providerRef,
      status: "paid",
      paidAt,
    },
  });
  await transaction.booking.update({
    where: { id: input.bookingId },
    data: { status: "confirmed_partial" },
  });

  return { amountCents, status: "confirmed_partial" as const };
}
