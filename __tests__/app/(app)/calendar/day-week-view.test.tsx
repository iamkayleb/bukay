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

  it("shifts the week grid when weekStartsOn=1 (Monday)", () => {
    // 2026-07-15 is a Wednesday. With Monday-start, the first column header
    // should render for Monday 2026-07-13.
    const html = renderToStaticMarkup(
      <DayWeekView
        bookings={[]}
        mode="week"
        anchorDate={new Date(2026, 6, 15)}
        weekStartsOn={1}
      />,
    );
    // Monday, Jul 13 comes before Wednesday, Jul 15 in the rendered grid.
    const monIdx = html.indexOf("Mon");
    const wedIdx = html.indexOf("Wed");
    expect(monIdx).toBeGreaterThan(-1);
    expect(wedIdx).toBeGreaterThan(-1);
    expect(monIdx).toBeLessThan(wedIdx);
    // Day 13 must appear before day 15 in the header row.
    const day13 = html.indexOf("13");
    const day15 = html.indexOf("15");
    expect(day13).toBeGreaterThan(-1);
    expect(day13).toBeLessThan(day15);
  });

  it("honours locale-derived week start (en-GB → Monday first)", () => {
    const html = renderToStaticMarkup(
      <DayWeekView
        bookings={[]}
        mode="week"
        anchorDate={new Date(2026, 6, 15)}
        locale="en-GB"
      />,
    );
    const monIdx = html.indexOf("Mon");
    const sunIdx = html.indexOf("Sun");
    expect(monIdx).toBeGreaterThan(-1);
    expect(sunIdx).toBeGreaterThan(-1);
    // Monday appears before Sunday when Monday is the first column.
    expect(monIdx).toBeLessThan(sunIdx);
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

  it("annotates slot cells with data-slot-day/data-slot-index for touch hit-testing", () => {
    const html = renderToStaticMarkup(
      <DayWeekView
        bookings={bookings}
        mode="day"
        anchorDate={new Date("2026-07-15T00:00:00Z")}
      />,
    );
    // At least one slot cell needs the touch-drop hooks.
    expect(html).toMatch(/data-slot-day="0"/);
    expect(html).toMatch(/data-slot-index="0"/);
  });

  it("disables browser touch scrolling on booking blocks so touch drag can take over", () => {
    const html = renderToStaticMarkup(
      <DayWeekView
        bookings={bookings}
        mode="day"
        anchorDate={new Date("2026-07-15T00:00:00Z")}
      />,
    );
    // React inlines the style; assert the intent survives to markup.
    expect(html).toMatch(/touch-action:\s*none/);
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
