import {
  calculateLifetimeValueCents,
  canonicalizeBookingStatus,
  canonicalizePaymentStatus,
  countNoShowBookings,
  normalizePersistedStatus,
} from "@/app/lib/statuses";

type ClientMetricPayment = {
  amountCents: number;
  status: string | null | undefined;
};

type ClientMetricBooking = {
  status: string | null | undefined;
  payments?: readonly ClientMetricPayment[] | null;
};

export type ClientMetricsInput = {
  bookings?: readonly ClientMetricBooking[] | null;
};

export type ClientMetrics = {
  bookingCount: number;
  lifetimeValueCents: number;
  noShowCount: number;
  unrecognizedBookingStatuses: string[];
  unrecognizedPaymentStatuses: string[];
};

export function summarizeClientMetrics(client: ClientMetricsInput): ClientMetrics {
  const bookings = client.bookings ?? [];
  const payments = bookings.flatMap((booking) => booking.payments ?? []);

  return {
    bookingCount: bookings.length,
    lifetimeValueCents: calculateLifetimeValueCents(payments),
    noShowCount: countNoShowBookings(bookings),
    unrecognizedBookingStatuses: collectUnrecognizedBookingStatuses(bookings),
    unrecognizedPaymentStatuses: collectUnrecognizedPaymentStatuses(payments),
  };
}

function collectUnrecognizedBookingStatuses(bookings: readonly ClientMetricBooking[]): string[] {
  return collectUnrecognizedStatuses(
    bookings.map((booking) => booking.status),
    canonicalizeBookingStatus
  );
}

function collectUnrecognizedPaymentStatuses(payments: readonly ClientMetricPayment[]): string[] {
  return collectUnrecognizedStatuses(
    payments.map((payment) => payment.status),
    canonicalizePaymentStatus
  );
}

function collectUnrecognizedStatuses(
  statuses: readonly (string | null | undefined)[],
  canonicalize: (status: string | null | undefined) => string | null
): string[] {
  const unrecognized = new Set<string>();

  for (const status of statuses) {
    const trimmedStatus = status?.trim();
    const normalizedStatus = normalizePersistedStatus(trimmedStatus);

    if (trimmedStatus && !canonicalize(trimmedStatus)) {
      unrecognized.add(normalizedStatus);
    }
  }

  return Array.from(unrecognized).sort((a, b) => a.localeCompare(b));
}
