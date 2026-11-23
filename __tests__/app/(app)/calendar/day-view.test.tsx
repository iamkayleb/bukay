// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react";

import { DayView } from "@/app/(app)/calendar/day-view";
import { renderDayViewHtml } from "../helpers/render-day-view";
import {
  merchantEmptyActions,
  merchantEmptyHrefs,
  merchantEmptyMessages,
} from "@/app/(app)/merchant-empty-copy";

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("DayView empty day", () => {
  it('shows "No bookings on this date" with a link to add a booking', async () => {
    const html = await renderDayViewHtml([]);

    expect(html).toContain(merchantEmptyMessages.calendarDay);
    expect(html).toContain("No bookings on this date");
    expect(html).toContain(`href="${merchantEmptyHrefs.calendarAddBooking}"`);
    expect(html).toContain(merchantEmptyActions.calendarAddBooking);
    expect(html).toContain('role="region"');
    expect(html).toContain('aria-label="Day schedule"');
    expect(html).toContain('data-testid="calendar-day-empty"');
    expect(html).toContain('data-testid="calendar-add-booking-link"');
    expect(html).toContain('data-testid="merchant-empty-state"');
    expect(html).toContain('role="status"');
  });

  it("keeps calendar day empty copy inside the day schedule region", async () => {
    const html = await renderDayViewHtml([]);
    const regionStart = html.indexOf('aria-label="Day schedule"');
    expect(regionStart).toBeGreaterThan(-1);
    const regionSlice = html.slice(regionStart, regionStart + 900);
    expect(regionSlice).toContain(merchantEmptyMessages.calendarDay);
    expect(regionSlice).toContain(merchantEmptyActions.calendarAddBooking);
    expect(regionSlice).toContain(`href="${merchantEmptyHrefs.calendarAddBooking}"`);
  });

  it("nests the add-booking link inside the merchant empty state", async () => {
    const html = await renderDayViewHtml([]);
    const emptyStateStart = html.indexOf('data-testid="merchant-empty-state"');
    const linkPos = html.indexOf('data-testid="calendar-add-booking-link"');
    expect(emptyStateStart).toBeGreaterThan(-1);
    expect(linkPos).toBeGreaterThan(emptyStateStart);
  });

  it("does not show the empty copy while bookings are loading", async () => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    let resolveFetch!: (value: { ok: boolean; json: () => Promise<unknown> }) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise((resolve) => {
            resolveFetch = resolve;
          })
      )
    );
    vi.stubGlobal("location", {
      ...window.location,
      search: "?date=2026-10-04",
    });

    try {
      await act(async () => {
        root.render(<DayView tenantId="tenant-empty" timeZone="Africa/Lagos" />);
      });
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(container.textContent).toContain("Loading bookings...");
      expect(container.textContent).not.toContain(merchantEmptyMessages.calendarDay);

      await act(async () => {
        resolveFetch({
          ok: true,
          json: async () => ({ ok: true, bookings: [] }),
        });
        await new Promise((resolve) => setTimeout(resolve, 0));
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(container.textContent).toContain(merchantEmptyMessages.calendarDay);
    } finally {
      act(() => {
        root.unmount();
      });
      container.remove();
      vi.unstubAllGlobals();
    }
  });

  it("does not show the empty copy when the day has bookings", async () => {
    const html = await renderDayViewHtml([
      {
        id: "book-1",
        startsAt: "2026-10-04T10:00:00.000Z",
        status: "confirmed",
        client: { name: "Ada Okonkwo" },
        service: { name: "Classic Haircut" },
      },
    ]);

    expect(html).not.toContain(merchantEmptyMessages.calendarDay);
    expect(html).toContain("Ada Okonkwo");
  });

  it("shows a load error instead of empty-day copy when bookings cannot be fetched", async () => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ ok: false }),
      })
    );
    vi.stubGlobal("location", {
      ...window.location,
      search: "?date=2026-10-04",
    });

    try {
      await act(async () => {
        root.render(<DayView tenantId="tenant-empty" timeZone="Africa/Lagos" />);
      });
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(container.textContent).toContain("Unable to load bookings");
      expect(container.textContent).not.toContain(merchantEmptyMessages.calendarDay);
      expect(container.textContent).not.toContain(merchantEmptyActions.calendarAddBooking);
    } finally {
      act(() => {
        root.unmount();
      });
      container.remove();
      vi.unstubAllGlobals();
    }
  });
});