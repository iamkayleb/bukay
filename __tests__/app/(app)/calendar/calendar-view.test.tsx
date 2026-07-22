import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import {
  CalendarView,
  bookingHeightPx,
  bookingOffsetPercent,
  bookingsForDay,
  normalizeBooking,
  startOfWeek,
  type CalendarBooking,
} from "@/app/(app)/calendar/calendar-view";

const bookings: CalendarBooking[] = [
  {
    id: "booking-1",
    clientName: "Ada Okafor",
    serviceName: "Classic Haircut",
    staffName: "Owner",
    startsAt: "2026-07-22T10:00:00.000Z",
    endsAt: "2026-07-22T10:45:00.000Z",
    status: "confirmed",
    notes: "Prefers mornings",
  },
  {
    id: "booking-2",
    clientName: "Bola Mensah",
    serviceName: "Beard Trim",
    staffName: null,
    startsAt: "2026-07-23T09:30:00.000Z",
    endsAt: "2026-07-23T09:50:00.000Z",
    status: "pending",
    notes: null,
  },
];

describe("calendar view helpers", () => {
  it("starts weeks on Monday", () => {
    expect(startOfWeek(new Date("2026-07-22T12:00:00.000Z")).toISOString()).toBe(
      "2026-07-20T00:00:00.000Z"
    );
  });

  it("sorts bookings for the selected day", () => {
    expect(bookingsForDay([...bookings].reverse(), new Date("2026-07-22T00:00:00.000Z"))).toEqual([
      bookings[0],
    ]);
  });

  it("calculates a visible block position and minimum height", () => {
    expect(bookingOffsetPercent(bookings[0])).toBe(20);
    expect(bookingHeightPx(bookings[0])).toBe(54);
    expect(
      bookingHeightPx({
        startsAt: "2026-07-22T10:00:00.000Z",
        endsAt: "2026-07-22T10:05:00.000Z",
      })
    ).toBe(34);
  });

  it("normalizes booking payloads emitted by manual creation", () => {
    expect(
      normalizeBooking({
        id: "booking-3",
        client: { name: "Chika" },
        service: { name: "Braids" },
        staff: { name: "Amaka" },
        startsAt: "2026-07-24T12:00:00.000Z",
        endsAt: "2026-07-24T13:00:00.000Z",
      })
    ).toEqual({
      id: "booking-3",
      clientName: "Chika",
      serviceName: "Braids",
      staffName: "Amaka",
      startsAt: "2026-07-24T12:00:00.000Z",
      endsAt: "2026-07-24T13:00:00.000Z",
      status: "confirmed",
      notes: null,
    });
  });
});

describe("CalendarView", () => {
  it("renders week columns with existing bookings", () => {
    const html = renderToStaticMarkup(
      <CalendarView bookings={bookings} initialDate="2026-07-22T12:00:00.000Z" />
    );

    expect(html).toContain("Jul 20 - Jul 26, 2026");
    expect(html).toContain("Wed, Jul 22");
    expect(html).toContain("Ada Okafor");
    expect(html).toContain("Classic Haircut");
  });
});
