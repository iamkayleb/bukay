// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react";

import { NewBookingForm } from "@/app/(app)/calendar/new-booking-form";
import {
  CALENDAR_BOOKING_DATE_EVENT,
  dispatchCalendarBookingDate,
} from "@/app/(app)/merchant-empty-copy";

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("NewBookingForm", () => {
  it("prefills the booking date from ?date= when the merchant adds one from an empty day", async () => {
    vi.stubGlobal("location", {
      ...window.location,
      search: "?date=2026-10-04",
    });

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    try {
      await act(async () => {
        root.render(
          <NewBookingForm
            tenantId="tenant-empty"
            timeZone="Africa/Lagos"
            services={[{ id: "svc-1", name: "Cut" }]}
            clients={[]}
          />
        );
      });
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      const dateInput = container.querySelector('input[name="date"]') as HTMLInputElement;
      expect(dateInput).not.toBeNull();
      expect(dateInput.value).toBe("2026-10-04");
    } finally {
      act(() => {
        root.unmount();
      });
      container.remove();
    }
  });

  it("updates the booking date when the empty-day link dispatches the calendar event", async () => {
    vi.stubGlobal("location", {
      ...window.location,
      search: "",
    });

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    try {
      await act(async () => {
        root.render(
          <NewBookingForm
            tenantId="tenant-empty"
            timeZone="Africa/Lagos"
            services={[{ id: "svc-1", name: "Cut" }]}
            clients={[]}
          />
        );
      });
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      const dateInput = container.querySelector('input[name="date"]') as HTMLInputElement;
      expect(dateInput.value).toBe("");

      await act(async () => {
        dispatchCalendarBookingDate("2026-10-05");
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(dateInput.value).toBe("2026-10-05");
      expect(CALENDAR_BOOKING_DATE_EVENT).toBe("bukay:calendar-booking-date");
    } finally {
      act(() => {
        root.unmount();
      });
      container.remove();
    }
  });
});