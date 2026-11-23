import { createRoot } from "react-dom/client";
import { act } from "react";
import { vi } from "vitest";

import { DayView } from "@/app/(app)/calendar/day-view";

/** Wait until DayView finishes its bookings fetch (aria-busy on the live region). */
export async function waitForDayViewSettled(container: HTMLElement): Promise<void> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const live = container.querySelector('[aria-live="polite"]');
    if (live?.getAttribute("aria-busy") === "false") {
      return;
    }
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 25));
    });
  }
  throw new Error(`DayView did not settle: ${container.textContent?.slice(0, 240) ?? ""}`);
}

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
    await waitForDayViewSettled(container);
    return container.innerHTML;
  } finally {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.unstubAllGlobals();
  }
}