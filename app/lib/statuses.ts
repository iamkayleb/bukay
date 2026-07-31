export const BOOKING_STATUS = {
  pending: "pending",
  confirmed: "confirmed",
  completed: "completed",
  cancelled: "cancelled",
  noShow: "no-show",
} as const;

export const PAYMENT_STATUS = {
  pending: "pending",
  paid: "paid",
  failed: "failed",
  refunded: "refunded",
} as const;

export type BookingStatus = (typeof BOOKING_STATUS)[keyof typeof BOOKING_STATUS];
export type PaymentStatus = (typeof PAYMENT_STATUS)[keyof typeof PAYMENT_STATUS];

type PaymentLike = {
  amountCents: number;
  status: string | null | undefined;
};

type BookingLike = {
  status: string | null | undefined;
};

const BOOKING_STATUS_ALIASES: Readonly<Record<string, BookingStatus>> = {
  pending: BOOKING_STATUS.pending,
  confirmed: BOOKING_STATUS.confirmed,
  completed: BOOKING_STATUS.completed,
  cancelled: BOOKING_STATUS.cancelled,
  canceled: BOOKING_STATUS.cancelled,
  "no-show": BOOKING_STATUS.noShow,
  noshow: BOOKING_STATUS.noShow,
};

const PAYMENT_STATUS_ALIASES: Readonly<Record<string, PaymentStatus>> = {
  pending: PAYMENT_STATUS.pending,
  paid: PAYMENT_STATUS.paid,
  failed: PAYMENT_STATUS.failed,
  refunded: PAYMENT_STATUS.refunded,
};

function normalizePersistedStatus(status: string | null | undefined): string {
  return (status ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-")
    .replace(/-+/g, "-");
}

export function canonicalizeBookingStatus(status: string | null | undefined): BookingStatus | null {
  return BOOKING_STATUS_ALIASES[normalizePersistedStatus(status)] ?? null;
}

export function canonicalizePaymentStatus(status: string | null | undefined): PaymentStatus | null {
  return PAYMENT_STATUS_ALIASES[normalizePersistedStatus(status)] ?? null;
}

export function isConfirmedBookingStatus(status: string | null | undefined): boolean {
  return canonicalizeBookingStatus(status) === BOOKING_STATUS.confirmed;
}

export function isNoShowBookingStatus(status: string | null | undefined): boolean {
  return canonicalizeBookingStatus(status) === BOOKING_STATUS.noShow;
}

export function isPaidPaymentStatus(status: string | null | undefined): boolean {
  return canonicalizePaymentStatus(status) === PAYMENT_STATUS.paid;
}

export function calculateLifetimeValueCents(payments: readonly PaymentLike[]): number {
  return payments.reduce(
    (total, payment) => total + (isPaidPaymentStatus(payment.status) ? payment.amountCents : 0),
    0
  );
}

export function countNoShowBookings(bookings: readonly BookingLike[]): number {
  return bookings.filter((booking) => isNoShowBookingStatus(booking.status)).length;
}
