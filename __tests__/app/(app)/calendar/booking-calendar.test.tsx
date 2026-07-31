import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { BookingCalendar } from "@/app/(app)/calendar/components/booking-calendar";

describe("BookingCalendar SSR", () => {
  const services = [
    { id: "svc-1", name: "Haircut", durationMinutes: 30, active: true },
    { id: "svc-2", name: "Retired", durationMinutes: 30, active: false },
  ];
  const staff = [{ id: "staff-1", name: "Alice", active: true }];

  it("renders the manual booking form and the empty upcoming list", () => {
    const html = renderToStaticMarkup(
      <BookingCalendar services={services} staff={staff} initialBookings={[]} />,
    );
    expect(html).toContain("Add a booking");
    expect(html).toContain("Create booking");
    expect(html).toContain("Existing client");
    expect(html).toContain("New client");
    expect(html).toContain("Haircut (30m)");
    expect(html).not.toContain("Retired");
    expect(html).toContain("Alice");
    expect(html).toContain("No scheduled bookings yet");
  });

  it("renders provided bookings in the upcoming list", () => {
    const html = renderToStaticMarkup(
      <BookingCalendar
        services={services}
        staff={staff}
        initialBookings={[
          {
            id: "booking-1",
            serviceId: "svc-1",
            staffId: "staff-1",
            clientId: "client-1",
            startsAt: "2026-07-15T10:00:00.000Z",
            endsAt: "2026-07-15T10:30:00.000Z",
            notes: "Regular customer",
            clientName: "Ada",
            serviceName: "Haircut",
            staffName: "Alice",
          },
        ]}
      />,
    );
    expect(html).toContain("Ada");
    expect(html).toContain("Haircut");
    expect(html).toContain("Alice");
    expect(html).toContain("Regular customer");
    expect(html).not.toContain("No scheduled bookings yet");
  });
});
