import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  findFirst: vi.fn(),
  upsert: vi.fn(),
  create: vi.fn(),
  holdCreate: vi.fn(),
  holdDeleteMany: vi.fn(),
  holdFindUnique: vi.fn(),
  holdUpdate: vi.fn(),
}));

vi.mock("@/app/db/prisma", () => ({
  prisma: {
    service: { findFirst: state.findFirst },
    client: { upsert: state.upsert },
    booking: { create: state.create },
    slotHold: {
      create: state.holdCreate,
      deleteMany: state.holdDeleteMany,
      findUnique: state.holdFindUnique,
      update: state.holdUpdate,
    },
  },
}));

import { POST } from "@/app/api/public/bookings/route";
import { SLOT_HOLD_DURATION_MS, slotHolds } from "@/app/lib/slot-hold";

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

beforeEach(async () => {
  state.findFirst.mockReset();
  state.upsert.mockReset();
  state.create.mockReset();
  state.holdCreate.mockReset();
  state.holdDeleteMany.mockReset();
  state.holdFindUnique.mockReset();
  state.holdUpdate.mockReset();

  const holds = new Map<string, { expiresAt: Date; sessionId: string }>();
  state.holdDeleteMany.mockImplementation(({ where }: { where: Record<string, unknown> }) => {
    if (!where.slotKey) {
      holds.clear();
    } else {
      const slotKey = where.slotKey as string;
      const hold = holds.get(slotKey);
      if (hold && hold.expiresAt <= (where.expiresAt as { lte: Date }).lte) {
        holds.delete(slotKey);
      }
    }
    return Promise.resolve({ count: 0 });
  });
  state.holdCreate.mockImplementation(
    ({ data }: { data: { expiresAt: Date; sessionId: string; slotKey: string } }) => {
      if (holds.has(data.slotKey)) {
        return Promise.reject({ code: "P2002" });
      }
      holds.set(data.slotKey, data);
      return Promise.resolve(data);
    }
  );
  state.holdFindUnique.mockImplementation(({ where }: { where: { slotKey: string } }) =>
    Promise.resolve(holds.get(where.slotKey) ?? null)
  );
  state.holdUpdate.mockImplementation(
    ({ data, where }: { data: { expiresAt: Date }; where: { slotKey: string } }) => {
      const hold = holds.get(where.slotKey);
      if (hold) holds.set(where.slotKey, { ...hold, ...data });
      return Promise.resolve(hold);
    }
  );
  await slotHolds.clear();
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
  it("creates a pending-payment booking and blocks another session while its hold is active", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-14T09:00:00.000Z"));

    const first = await POST(bookingRequest("session-a"));
    expect(first.status).toBe(201);
    await expect(first.json()).resolves.toMatchObject({ booking: { status: "pending_payment" } });
    expect(state.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "pending_payment" }) })
    );

    expect((await POST(bookingRequest("session-b"))).status).toBe(409);

    vi.useRealTimers();
  });

  it("releases a held slot at the ten-minute expiry boundary", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-14T09:00:00.000Z"));

    expect((await POST(bookingRequest("session-a"))).status).toBe(201);
    vi.advanceTimersByTime(SLOT_HOLD_DURATION_MS - 1);
    expect((await POST(bookingRequest("session-b"))).status).toBe(409);

    vi.advanceTimersByTime(1);
    expect((await POST(bookingRequest("session-b"))).status).toBe(201);
    vi.useRealTimers();
  });
});
