export const CONFIRMED_BOOKING_STATUS = "confirmed";
export const PAID_PAYMENT_STATUS = "paid";
export const NO_SHOW_BOOKING_STATUS = "no-show";

export type ClientProfilePayment = {
  amountCents: number;
  currency: string;
  status: string;
};

export type ClientProfileBooking = {
  status: string;
  payments: ClientProfilePayment[];
};

export function computeLifetimeValueCents(bookings: ClientProfileBooking[]) {
  return bookings.reduce((total, booking) => {
    if (booking.status !== CONFIRMED_BOOKING_STATUS) {
      return total;
    }

    const confirmedPaymentTotal = booking.payments.reduce((bookingTotal, payment) => {
      if (payment.status !== PAID_PAYMENT_STATUS) {
        return bookingTotal;
      }

      return bookingTotal + payment.amountCents;
    }, 0);

    return total + confirmedPaymentTotal;
  }, 0);
}

export function countNoShows(bookings: Array<{ status: string }>) {
  return bookings.filter((booking) => booking.status === NO_SHOW_BOOKING_STATUS).length;
}

export function formatMoneyFromCents(amountCents: number, currency: string) {
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency,
  }).format(amountCents / 100);
}
