import { createRoot } from "react-dom/client";
import { act } from "react";
import { vi } from "vitest";

import { DayView } from "@/app/(app)/calendar/day-view";

export async function renderDayViewHtml(
  bookings: unknown[],
  options: { tenantId?: string; timeZone?: string; date?: string } = {}
): Promise<string> {
  const { tenantId = "tenant-empty", timeZone = "Africa/Lagos", date = "2026-10-04" } =
    options;

  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, bookings }),
    })
  );
  vi.stubGlobal("location", {
    ...window.location,
    search: `?date=${date}`,
  });

  try {
    await act(async () => {
      root.render(<DayView tenantId={tenantId} timeZone={timeZone} />);
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    return container.innerHTML;
  } finally {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.unstubAllGlobals();
  }
}