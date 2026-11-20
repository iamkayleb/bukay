// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";

import { DayView } from "@/app/(app)/calendar/day-view";

function flushPromises(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

describe("DayView empty state", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true, bookings: [] }),
      })
    );

    vi.stubGlobal("location", {
      ...window.location,
      search: "?date=2026-10-04",
    });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("shows no-bookings copy with a link to add one when the day has no bookings", async () => {
    await act(async () => {
      root.render(<DayView tenantId="tenant-empty" timeZone="Africa/Lagos" />);
    });

    await act(async () => {
      await flushPromises();
      await flushPromises();
    });

    const html = container.innerHTML;
    expect(html).toContain("No bookings on this date.");
    expect(html).toContain('href="#new-booking"');
    expect(html).toContain("Add a booking");
    expect(fetch).toHaveBeenCalled();
  });
});