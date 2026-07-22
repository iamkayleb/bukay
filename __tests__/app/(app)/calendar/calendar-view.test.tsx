import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import {
  CalendarView,
  bookingHeightPx,
  bookingOffsetPercent,
  bookingsForDay,
  buildEditBookingPayload,
  dateTimeLocalValue,
  editFormFromBooking,
  hasBookingOverlap,
  isInsideCalendarHours,
  moveBookingToStart,
  normalizeBooking,
  startForDrop,
  startOfWeek,
  validateReschedule,
  type CalendarBooking,
} from "@/app/(app)/calendar/calendar-view";

const bookings: CalendarBooking[] = [
  {
    id: "booking-1",
    serviceId: "service-1",
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
    serviceId: "service-2",
    clientName: "Bola Mensah",
    serviceName: "Beard Trim",
    staffName: null,
    startsAt: "2026-07-23T09:30:00.000Z",
    endsAt: "2026-07-23T09:50:00.000Z",
    status: "pending",
    notes: null,
  },
];

const services = [
  { id: "service-1", name: "Classic Haircut", durationMinutes: 45 },
  { id: "service-2", name: "Beard Trim", durationMinutes: 20 },
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
        serviceId: "service-2",
        client: { name: "Chika" },
        service: { name: "Braids" },
        staff: { name: "Amaka" },
        startsAt: "2026-07-24T12:00:00.000Z",
        endsAt: "2026-07-24T13:00:00.000Z",
      })
    ).toEqual({
      id: "booking-3",
      serviceId: "service-2",
      clientName: "Chika",
      serviceName: "Braids",
      staffName: "Amaka",
      startsAt: "2026-07-24T12:00:00.000Z",
      endsAt: "2026-07-24T13:00:00.000Z",
      status: "confirmed",
      notes: null,
    });
  });

  it("snaps drag drops to 15 minute starts", () => {
    const startsAt = startForDrop(new Date("2026-07-22T00:00:00.000Z"), 91, {
      top: 20,
      height: 720,
    });

    expect(startsAt?.toISOString()).toBe("2026-07-22T08:45:00.000Z");
    expect(startForDrop(new Date("2026-07-22T00:00:00.000Z"), 10, { top: 20, height: 720 })).toBe(
      null
    );
  });

  it("moves bookings while preserving duration", () => {
    expect(moveBookingToStart(bookings[0], new Date("2026-07-24T13:15:00.000Z"))).toMatchObject({
      id: "booking-1",
      startsAt: "2026-07-24T13:15:00.000Z",
      endsAt: "2026-07-24T14:00:00.000Z",
    });
  });

  it("builds edit payloads with service duration and trimmed notes", () => {
    expect(dateTimeLocalValue("2026-07-22T10:00:00.000Z")).toBe("2026-07-22T10:00");
    expect(editFormFromBooking(bookings[0])).toEqual({
      serviceId: "service-1",
      startsAt: "2026-07-22T10:00",
      notes: "Prefers mornings",
      status: "confirmed",
    });
    expect(
      buildEditBookingPayload(
        {
          serviceId: "service-2",
          startsAt: "2026-07-22T11:00",
          notes: "  Bring reference photo  ",
          status: "completed",
        },
        services
      )
    ).toEqual({
      serviceId: "service-2",
      startsAt: "2026-07-22T11:00:00.000Z",
      endsAt: "2026-07-22T11:20:00.000Z",
      notes: "Bring reference photo",
      status: "completed",
    });
  });

  it("rejects drops outside calendar hours", () => {
    const earlyBooking = moveBookingToStart(bookings[0], new Date("2026-07-24T07:45:00.000Z"));
    const lateBooking = moveBookingToStart(bookings[0], new Date("2026-07-24T17:30:00.000Z"));

    expect(isInsideCalendarHours(earlyBooking)).toBe(false);
    expect(isInsideCalendarHours(lateBooking)).toBe(false);
    expect(validateReschedule(lateBooking, bookings)).toBe("outside_hours");
  });

  it("rejects drag reschedules that overlap another booking", () => {
    const candidate = moveBookingToStart(bookings[0], new Date("2026-07-23T09:15:00.000Z"));

    expect(hasBookingOverlap(candidate, bookings)).toBe(true);
    expect(validateReschedule(candidate, bookings)).toBe("booking_overlap");
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
    expect(html).toContain('draggable="true"');
  });
});
