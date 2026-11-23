import { describe, expect, it } from "vitest";

import {
  merchantEmptyActions,
  merchantEmptyHrefs,
  merchantEmptyMessages,
  MERCHANT_EMPTY_COPY,
} from "@/app/(app)/merchant-empty-copy";

describe("merchant empty copy (#556)", () => {
  it("pins calendar day empty message with add-booking navigation", () => {
    expect(merchantEmptyMessages.calendarDay).toBe("No bookings on this date.");
    expect(merchantEmptyActions.calendarAddBooking).toBe("Add a booking");
    expect(merchantEmptyHrefs.calendarAddBooking).toBe("#new-booking");
  });

  it("lists exactly five merchant-screen messages", () => {
    expect(MERCHANT_EMPTY_COPY).toHaveLength(5);
    expect(MERCHANT_EMPTY_COPY).toContain(merchantEmptyMessages.calendarDay);
    expect(MERCHANT_EMPTY_COPY).toContain(merchantEmptyMessages.clients);
  });

  it("pins issue #556 empty copy on each merchant screen", () => {
    expect(merchantEmptyMessages.calendarDay).toContain("No bookings on this date");
    expect(merchantEmptyMessages.services).toContain("No services yet");
    expect(merchantEmptyMessages.clients).toContain("No clients yet");
    expect(merchantEmptyMessages.payments).toContain("No payments yet");
    expect(merchantEmptyMessages.today).toContain("No appointments yet");
    expect(merchantEmptyHrefs.todayCalendar).toBe("/calendar");
  });
});