import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  getConfirmedBooking: vi.fn(),
}));

vi.mock("@/app/[slug]/book/confirmed/data", () => ({
  getConfirmedBooking: state.getConfirmedBooking,
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    const err = new Error("__NOT_FOUND__");
    (err as { digest?: string }).digest = "NEXT_NOT_FOUND";
    throw err;
  },
}));

import BookingConfirmedPage from "@/app/[slug]/book/confirmed/page";

function booking() {
  return {
    id: "booking-1",
    startsAt: new Date("2026-07-27T10:00:00.000Z"),
    endsAt: new Date("2026-07-27T11:00:00.000Z"),
    status: "confirmed",
    tenantName: "Bukay Demo Salon",
    tenantSlug: "demo",
    serviceName: "Classic Haircut",
    clientName: "Jane Doe",
  };
}

beforeEach(() => {
  state.getConfirmedBooking.mockReset();
});

describe("BookingConfirmedPage", () => {
  it("renders booking details and a calendar download link for a valid token", async () => {
    state.getConfirmedBooking.mockResolvedValue({ ok: true, booking: booking() });

    const result = await BookingConfirmedPage({
      params: { slug: "demo" },
      searchParams: { token: "valid-token" },
    });

    expect(state.getConfirmedBooking).toHaveBeenCalledWith("demo", "valid-token");
    const json = JSON.stringify(result);
    expect(json).toContain("Classic Haircut");
    expect(json).toContain("Bukay Demo Salon");
    expect(json).toContain("Jane Doe");
    expect(json).toContain("data:text/calendar");
    expect(json).toContain(encodeURIComponent("BEGIN:VCALENDAR"));
    expect(json).toContain("action=reschedule");
    expect(json).toContain("action=cancel");
  });

  it("renders an invalid-link message for a tampered token", async () => {
    state.getConfirmedBooking.mockResolvedValue({ ok: false, status: 400 });

    const result = await BookingConfirmedPage({
      params: { slug: "demo" },
      searchParams: { token: "tampered" },
    });

    expect(JSON.stringify(result)).toContain("invalid");
  });

  it("renders an expired-link message for an expired token", async () => {
    state.getConfirmedBooking.mockResolvedValue({ ok: false, status: 410 });

    const result = await BookingConfirmedPage({
      params: { slug: "demo" },
      searchParams: { token: "expired" },
    });

    expect(JSON.stringify(result)).toContain("expired");
  });

  it("calls notFound() when the booking does not exist for the tenant", async () => {
    state.getConfirmedBooking.mockResolvedValue({ ok: false, status: 404 });

    await expect(
      BookingConfirmedPage({ params: { slug: "demo" }, searchParams: { token: "x" } })
    ).rejects.toThrow("__NOT_FOUND__");
  });
});
