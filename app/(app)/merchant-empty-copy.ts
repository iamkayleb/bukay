/** Merchant-screen empty-state copy for #556 — keep in sync with empty-states tests. */
export const merchantEmptyMessages = {
  calendarDay: "No bookings on this date.",
  services: "No services yet — add your first so customers can book.",
  clients: "No clients yet — they appear here after their first booking.",
  payments: "No payments yet.",
  today: "No appointments yet.",
} as const;

export const MERCHANT_EMPTY_COPY = Object.values(merchantEmptyMessages);