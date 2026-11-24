/** Issue #556 PR task 1 headline (full UI copy includes trailing punctuation in `calendarDay`). */
export const merchantEmptyCalendarDayHeadline = "No bookings on this date" as const;

/** Merchant-screen empty-state copy for #556 — keep in sync with empty-states tests. */
export const merchantEmptyMessages = {
  calendarDay: `${merchantEmptyCalendarDayHeadline}.`,
  services: "No services yet — add your first so customers can book.",
  clients: "No clients yet — they appear here after their first booking.",
  payments: "No payments yet.",
  today: "No appointments yet.",
} as const;

/** Empty-state action labels — keep in sync with empty-states tests. */
export const merchantEmptyActions = {
  calendarAddBooking: "Add a booking",
  todayAddOnCalendar: "Add a booking on the calendar",
} as const;

/** Empty-state link targets — keep in sync with empty-states tests. */
export const merchantEmptyHrefs = {
  calendarAddBooking: "#new-booking",
  todayCalendar: "/calendar",
} as const;

/** Empty-day link carries the chosen day so NewBookingForm can prefill without a full navigation. */
export function calendarAddBookingHref(selectedDate: string): string {
  if (selectedDate && /^\d{4}-\d{2}-\d{2}$/.test(selectedDate)) {
    return `?date=${selectedDate}${merchantEmptyHrefs.calendarAddBooking}`;
  }
  return merchantEmptyHrefs.calendarAddBooking;
}

export const CALENDAR_BOOKING_DATE_EVENT = "bukay:calendar-booking-date";

export type CalendarBookingDateDetail = { date: string };

export function dispatchCalendarBookingDate(date: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<CalendarBookingDateDetail>(CALENDAR_BOOKING_DATE_EVENT, {
      detail: { date },
    })
  );
}

/** Shared Tailwind classes for empty-state action links (calendar + today). */
export const merchantEmptyActionLinkClassName =
  "text-sm font-medium text-emerald-300 hover:text-emerald-200 focus-visible:rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400";

export type MerchantEmptyMessageKey = keyof typeof merchantEmptyMessages;

/** Server-rendered merchant screens (calendar day copy is shown by client DayView). */
export const SERVER_MERCHANT_EMPTY_SCREENS = [
  "clients",
  "services",
  "payments",
  "today",
] as const satisfies readonly MerchantEmptyMessageKey[];

/** Client-rendered merchant screens that fetch data after mount. */
export const CLIENT_MERCHANT_EMPTY_SCREENS = [
  "calendarDay",
] as const satisfies readonly MerchantEmptyMessageKey[];

export const MERCHANT_EMPTY_COPY = Object.values(merchantEmptyMessages);