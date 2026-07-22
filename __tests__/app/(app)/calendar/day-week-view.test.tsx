import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import {
  DayWeekView,
  DayWeekNavigator,
} from "@/app/(app)/calendar/components/day-week-view";

describe("DayWeekView SSR", () => {
  const bookings = [
    {
      id: "booking-1",
      serviceId: "svc-1",
      staffId: "staff-1",
      clientId: "client-1",
      startsAt: "2026-07-15T10:00:00.000Z",
      endsAt: "2026-07-15T10:30:00.000Z",
      notes: null,
      clientName: "Ada",
      serviceName: "Haircut",
      staffName: "Alice",
    },
  ];

  it("renders a day view with the booking block", () => {
    const html = renderToStaticMarkup(
      <DayWeekView
        bookings={bookings}
        mode="day"
        anchorDate={new Date("2026-07-15T00:00:00Z")}
      />,
    );
    expect(html).toContain("Day view");
    expect(html).toContain("Ada");
    expect(html).toContain("Haircut");
  });

  it("renders a week view with 7 day column headers", () => {
    const html = renderToStaticMarkup(
      <DayWeekView
        bookings={[]}
        mode="week"
        anchorDate={new Date("2026-07-15T00:00:00Z")}
      />,
    );
    expect(html).toContain("Week view");
    // Grid contains at least Sun/Sat header cells for a week
    expect(html).toContain("Sun");
    expect(html).toContain("Sat");
  });

  it("makes booking blocks draggable and gives them a stable test id", () => {
    const html = renderToStaticMarkup(
      <DayWeekView
        bookings={bookings}
        mode="day"
        anchorDate={new Date("2026-07-15T00:00:00Z")}
      />,
    );
    expect(html).toContain('draggable="true"');
    expect(html).toContain('data-testid="booking-booking-1"');
  });
});

describe("DayWeekNavigator SSR", () => {
  it("renders Day and Week buttons", () => {
    const html = renderToStaticMarkup(
      <DayWeekNavigator
        mode="day"
        onModeChange={() => {}}
        anchorDate={new Date("2026-07-15T00:00:00Z")}
        onAnchorChange={() => {}}
      />,
    );
    expect(html).toContain(">Day<");
    expect(html).toContain(">Week<");
    expect(html).toContain(">Today<");
  });
});
