/** Merchant-screen empty-state copy for #556 — keep in sync with empty-states tests. */
export const merchantEmptyMessages = {
  calendarDay: "No bookings on this date.",
  services: "No services yet — add your first so customers can book.",
  clients: "No clients yet — they appear here after their first booking.",
  payments: "No payments yet.",
  today: "No appointments yet.",
} as const;

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