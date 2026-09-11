import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  findFirst: vi.fn(),
  upsert: vi.fn(),
  create: vi.fn(),
}));

vi.mock("@/app/db/prisma", () => ({
  prisma: {
    service: { findFirst: state.findFirst },
    client: { upsert: state.upsert },
    booking: { create: state.create },
  },
}));

import { POST } from "@/app/api/public/bookings/route";
import { slotHolds } from "@/app/lib/slot-hold";

const bookingRequest = (sessionId: string) =>
  new NextRequest("http://app.test/api/public/bookings", {
    method: "POST",
    body: JSON.stringify({
      slug: "demo",
      serviceId: "service-1",
      startsAt: "2026-09-14T10:00:00.000Z",
      name: "Ada Okafor",
      phone: "08031234567",
      sessionId,
    }),
  });

beforeEach(() => {
  slotHolds.clear();
  state.findFirst.mockReset();
  state.upsert.mockReset();
  state.create.mockReset();
  state.findFirst.mockResolvedValue({
    id: "service-1",
    tenantId: "tenant-1",
    durationMinutes: 30,
    tenant: { currency: "NGN", slug: "demo" },
  });
  state.upsert.mockResolvedValue({ id: "client-1" });
  state.create.mockResolvedValue({ id: "booking-1", status: "pending_payment" });
});

describe("POST /api/public/bookings", () => {
  it("creates a pending-payment booking, blocks another session, and releases the hold after ten minutes", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-14T09:00:00.000Z"));

    const first = await POST(bookingRequest("session-a"));
    expect(first.status).toBe(201);
    await expect(first.json()).resolves.toMatchObject({ booking: { status: "pending_payment" } });
    expect(state.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "pending_payment" }) })
    );

    expect((await POST(bookingRequest("session-b"))).status).toBe(409);

    vi.advanceTimersByTime(10 * 60 * 1_000);
    expect((await POST(bookingRequest("session-b"))).status).toBe(201);
    vi.useRealTimers();
  });
});
