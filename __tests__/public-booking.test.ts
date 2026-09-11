import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SLOT_HOLD_TTL_MS, SlotHoldStore } from "@/app/lib/slot-hold";

class FakeClock {
  constructor(public t = 1_700_000_000_000) {}
  now() {
    return this.t;
  }
  advance(ms: number) {
    this.t += ms;
  }
}

describe("SlotHoldStore", () => {
  const key = {
    tenantId: "tenant-1",
    serviceId: "service-1",
    staffId: null as string | null,
    startsAt: new Date("2026-08-03T10:00:00.000Z"),
  };

  it("grants a hold and rejects a second acquire for the same slot", () => {
    const store = new SlotHoldStore(new FakeClock());

    const first = store.acquire(key);
    expect(first.ok).toBe(true);

    const second = store.acquire(key);
    expect(second).toEqual({ ok: false, reason: "held", expiresAt: expect.any(Number) });
  });

  it("releases the hold after 10 minutes", () => {
    const clock = new FakeClock();
    const store = new SlotHoldStore(clock);

    const first = store.acquire(key);
    if (!first.ok) throw new Error("expected ok");
    expect(first.expiresAt).toBe(clock.now() + SLOT_HOLD_TTL_MS);

    clock.advance(SLOT_HOLD_TTL_MS + 1);

    const second = store.acquire(key);
    expect(second.ok).toBe(true);
  });

  it("allows explicit release before expiry", () => {
    const store = new SlotHoldStore(new FakeClock());
    const first = store.acquire(key);
    if (!first.ok) throw new Error("expected ok");

    store.release(key, first.holdId);

    const second = store.acquire(key);
    expect(second.ok).toBe(true);
  });

  it("isolates holds by service, staff, and start time", () => {
    const store = new SlotHoldStore(new FakeClock());
    expect(store.acquire(key).ok).toBe(true);
    expect(store.acquire({ ...key, serviceId: "service-2" }).ok).toBe(true);
    expect(store.acquire({ ...key, staffId: "staff-1" }).ok).toBe(true);
    expect(store.acquire({ ...key, startsAt: new Date("2026-08-03T11:00:00.000Z") }).ok).toBe(true);
  });
});

type TenantRow = { id: string; slug: string; active: boolean };
type ServiceRow = {
  id: string;
  tenantId: string;
  durationMinutes: number;
  active: boolean;
};
type ClientRow = { id: string; tenantId: string; name: string; phone: string };
type BookingRow = {
  id: string;
  tenantId: string;
  clientId: string;
  serviceId: string;
  staffId: string | null;
  startsAt: Date;
  endsAt: Date;
  status: string;
  notes: string | null;
};
type BusinessHourRow = {
  tenantId: string;
  dayOfWeek: number;
  opensAt: string;
  closesAt: string;
  isClosed: boolean;
};

const state = vi.hoisted(() => ({
  tenants: [] as TenantRow[],
  services: [] as ServiceRow[],
  clients: [] as ClientRow[],
  bookings: [] as BookingRow[],
  businessHours: [] as BusinessHourRow[],
  nextId: 0,
}));

vi.mock("@/app/db/prisma", () => ({
  prisma: {
    tenant: {
      findUnique: vi.fn(
        async (args: { where: { slug: string } }) =>
          state.tenants.find((t) => t.slug === args.where.slug) ?? null
      ),
    },
    service: {
      findFirst: vi.fn(
        async (args: { where: { tenantId: string; id: string; active: boolean } }) =>
          state.services.find(
            (s) =>
              s.tenantId === args.where.tenantId &&
              s.id === args.where.id &&
              s.active === args.where.active
          ) ?? null
      ),
    },
    client: {
      findFirst: vi.fn(
        async (args: { where: { tenantId: string; phone: string } }) =>
          state.clients.find(
            (c) => c.tenantId === args.where.tenantId && c.phone === args.where.phone
          ) ?? null
      ),
      create: vi.fn(async (args: { data: Omit<ClientRow, "id"> }) => {
        const row: ClientRow = { id: `client-${state.nextId++}`, ...args.data };
        state.clients.push(row);
        return row;
      }),
      update: vi.fn(async (args: { where: { id: string }; data: Partial<ClientRow> }) => {
        const index = state.clients.findIndex((c) => c.id === args.where.id);
        state.clients[index] = { ...state.clients[index], ...args.data };
        return state.clients[index];
      }),
    },
    booking: {
      findMany: vi.fn(
        async (args: {
          where: {
            tenantId: string;
            id: { not: string };
            staffId: string | null;
            startsAt: { lt: Date };
            endsAt: { gt: Date };
          };
          take: number;
        }) =>
          state.bookings
            .filter(
              (b) =>
                b.tenantId === args.where.tenantId &&
                b.id !== args.where.id.not &&
                b.staffId === args.where.staffId &&
                b.startsAt < args.where.startsAt.lt &&
                b.endsAt > args.where.endsAt.gt
            )
            .slice(0, args.take)
      ),
      create: vi.fn(async (args: { data: Omit<BookingRow, "id"> }) => {
        const row: BookingRow = { id: `booking-${state.nextId++}`, ...args.data };
        state.bookings.push(row);
        return row;
      }),
    },
    businessHour: {
      findFirst: vi.fn(
        async (args: { where: { tenantId: string; dayOfWeek: number } }) =>
          state.businessHours.find(
            (h) => h.tenantId === args.where.tenantId && h.dayOfWeek === args.where.dayOfWeek
          ) ?? null
      ),
    },
  },
}));

import { POST } from "@/app/api/public/bookings/route";
import { __resetSlotHoldStoreForTests } from "@/app/lib/slot-hold";

function bookingRequest(body: unknown) {
  return new NextRequest("http://app.test/api/public/bookings", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const VALID_BODY = {
  slug: "demo",
  serviceId: "service-1",
  startsAt: "2026-08-03T10:00:00.000Z",
  name: "Ada Lovelace",
  phone: "08031234567",
};

beforeEach(() => {
  __resetSlotHoldStoreForTests();
  state.tenants = [{ id: "tenant-1", slug: "demo", active: true }];
  state.services = [{ id: "service-1", tenantId: "tenant-1", durationMinutes: 60, active: true }];
  state.clients = [];
  state.bookings = [];
  state.businessHours = [
    {
      tenantId: "tenant-1",
      dayOfWeek: 1,
      opensAt: "09:00",
      closesAt: "17:00",
      isClosed: false,
    },
  ];
  vi.useRealTimers();
});

describe("POST /api/public/bookings", () => {
  it("creates a booking with status pending_payment for a valid request", async () => {
    const res = await POST(bookingRequest(VALID_BODY));

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.booking.status).toBe("pending_payment");
    expect(state.bookings).toHaveLength(1);
    expect(state.bookings[0].status).toBe("pending_payment");
    expect(state.clients).toHaveLength(1);
    expect(state.clients[0].phone).toBe("+2348031234567");
  });

  it("returns 409 when a second session requests the same held slot", async () => {
    const first = await POST(bookingRequest(VALID_BODY));
    expect(first.status).toBe(201);

    const second = await POST(
      bookingRequest({ ...VALID_BODY, name: "Grace Hopper", phone: "08099999999" })
    );

    expect(second.status).toBe(409);
    const body = await second.json();
    expect(body.error).toBe("slot_held");
    expect(state.bookings).toHaveLength(1);
  });

  it("rejects an invalid Nigerian phone number", async () => {
    const res = await POST(bookingRequest({ ...VALID_BODY, phone: "12345" }));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_phone");
    expect(state.bookings).toHaveLength(0);
  });

  it("returns 404 for an unknown tenant slug", async () => {
    const res = await POST(bookingRequest({ ...VALID_BODY, slug: "missing" }));

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("tenant_not_found");
  });

  it("returns 404 for an unknown or inactive service", async () => {
    const res = await POST(bookingRequest({ ...VALID_BODY, serviceId: "missing" }));

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("service_not_found");
  });

  it("rejects a booking outside business hours and releases the hold", async () => {
    const res = await POST(bookingRequest({ ...VALID_BODY, startsAt: "2026-08-03T20:00:00.000Z" }));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("OUTSIDE_BUSINESS_HOURS");
    expect(state.bookings).toHaveLength(0);

    // the hold for the rejected slot must have been released
    const retry = await POST(
      bookingRequest({ ...VALID_BODY, startsAt: "2026-08-03T20:00:00.000Z" })
    );
    expect(retry.status).toBe(400);
  });
});
