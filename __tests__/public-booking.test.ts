import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  tenants: [] as Array<{
    id: string;
    slug: string;
    name: string;
    currency: string;
    timezone: string;
  }>,
  services: [] as Array<{
    id: string;
    tenantId: string;
    name: string;
    durationMinutes: number;
    priceCents: number;
    currency: string;
    active: boolean;
  }>,
  clients: [] as Array<{
    id: string;
    tenantId: string;
    name: string;
    phone: string;
    email: string | null;
    notes: string | null;
  }>,
  bookings: [] as Array<{
    id: string;
    tenantId: string;
    clientId: string;
    serviceId: string;
    staffId: string | null;
    startsAt: Date;
    endsAt: Date;
    status: string;
    notes: string | null;
    createdAt: Date;
    updatedAt: Date;
  }>,
  now: 1_700_000_000_000,
}));

vi.mock("@/app/db/prisma", () => ({
  prisma: {
    tenant: {
      findUnique: vi.fn(async (args: { where: { slug: string } }) =>
        state.tenants.find((row) => row.slug === args.where.slug) ?? null
      ),
    },
    service: {
      findFirst: vi.fn(
        async (args: {
          where: { tenantId: string; id: string; active?: boolean };
        }) =>
          state.services.find(
            (row) =>
              row.tenantId === args.where.tenantId &&
              row.id === args.where.id &&
              (args.where.active === undefined || row.active === args.where.active)
          ) ?? null
      ),
    },
    client: {
      findFirst: vi.fn(
        async (args: { where: { tenantId: string; phone: string } }) =>
          state.clients.find(
            (row) => row.tenantId === args.where.tenantId && row.phone === args.where.phone
          ) ?? null
      ),
      create: vi.fn(
        async (args: {
          data: { tenantId: string; name: string; phone: string };
        }) => {
          const row = {
            id: `client-${state.clients.length + 1}`,
            tenantId: args.data.tenantId,
            name: args.data.name,
            phone: args.data.phone,
            email: null,
            notes: null,
          };
          state.clients.push(row);
          return row;
        }
      ),
    },
    booking: {
      findMany: vi.fn(
        async (args: {
          where: {
            tenantId: string;
            serviceId: string;
            startsAt?: Date | { lt: Date };
            endsAt?: { gt: Date };
            status?: string | { not: string };
          };
          take?: number;
        }) => {
          const rows = state.bookings.filter((row) => {
            if (row.tenantId !== args.where.tenantId) return false;
            if (row.serviceId !== args.where.serviceId) return false;
            if (typeof args.where.status === "string" && row.status !== args.where.status) {
              return false;
            }
            if (
              args.where.status &&
              typeof args.where.status === "object" &&
              "not" in args.where.status &&
              row.status === args.where.status.not
            ) {
              return false;
            }
            if (args.where.startsAt instanceof Date) {
              if (row.startsAt.getTime() !== args.where.startsAt.getTime()) return false;
            } else if (args.where.startsAt && args.where.endsAt) {
              return row.startsAt < args.where.startsAt.lt && row.endsAt > args.where.endsAt.gt;
            }
            return true;
          });
          return args.take ? rows.slice(0, args.take) : rows;
        }
      ),
      updateMany: vi.fn(
        async (args: {
          where: {
            tenantId: string;
            serviceId?: string;
            id?: string;
            startsAt?: Date;
            status?: string;
          };
          data: { status: string };
        }) => {
          let count = 0;
          for (const row of state.bookings) {
            if (row.tenantId !== args.where.tenantId) continue;
            if (args.where.serviceId && row.serviceId !== args.where.serviceId) continue;
            if (args.where.id && row.id !== args.where.id) continue;
            if (
              args.where.startsAt &&
              row.startsAt.getTime() !== args.where.startsAt.getTime()
            ) {
              continue;
            }
            if (args.where.status && row.status !== args.where.status) continue;
            row.status = args.data.status;
            count += 1;
          }
          return { count };
        }
      ),
      create: vi.fn(
        async (args: {
          data: {
            tenantId: string;
            clientId: string;
            serviceId: string;
            startsAt: Date;
            endsAt: Date;
            status: string;
            notes: string | null;
          };
        }) => {
          const now = new Date(state.now);
          const row = {
            id: `booking-${state.bookings.length + 1}`,
            tenantId: args.data.tenantId,
            clientId: args.data.clientId,
            serviceId: args.data.serviceId,
            staffId: null,
            startsAt: args.data.startsAt,
            endsAt: args.data.endsAt,
            status: args.data.status,
            notes: args.data.notes,
            createdAt: now,
            updatedAt: now,
          };
          state.bookings.push(row);
          return row;
        }
      ),
    },
  },
}));

import { POST, createPublicBooking, PUBLIC_BOOKING_STATUS } from "@/app/api/public/bookings/route";
import {
  SLOT_HOLD_TTL_MS,
  SlotHoldStore,
  __resetSlotHoldStoreForTests,
  __setSlotHoldStoreForTests,
  getSlotHoldStore,
} from "@/app/lib/slot-hold";
import { isValidNigerianPhone, validateNigerianPhone } from "@/app/lib/phone";

const STARTS_AT = "2026-07-27T10:00:00.000Z";

function seedTenant() {
  state.tenants = [
    {
      id: "tenant-1",
      slug: "demo",
      name: "Bukay Demo Salon",
      currency: "NGN",
      timezone: "Africa/Lagos",
    },
  ];
  state.services = [
    {
      id: "service-1",
      tenantId: "tenant-1",
      name: "Classic Haircut",
      durationMinutes: 30,
      priceCents: 5000,
      currency: "NGN",
      active: true,
    },
  ];
  state.clients = [];
  state.bookings = [];
}

function jsonRequest(body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest("http://app.test/api/public/bookings", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

function bookingBody(overrides: Record<string, unknown> = {}) {
  return {
    slug: "demo",
    serviceId: "service-1",
    startsAt: STARTS_AT,
    customerName: "Ada Okonkwo",
    phone: "08031234567",
    sessionId: "session-a",
    ...overrides,
  };
}

beforeEach(() => {
  seedTenant();
  state.now = 1_700_000_000_000;
  __resetSlotHoldStoreForTests();
  __setSlotHoldStoreForTests(
    new SlotHoldStore({
      now: () => state.now,
    })
  );
});

afterEach(() => {
  __resetSlotHoldStoreForTests();
});

describe("app/lib/phone", () => {
  it("validates and normalizes Nigerian numbers", () => {
    expect(isValidNigerianPhone("08031234567")).toBe(true);
    expect(validateNigerianPhone("08031234567")).toBe("+2348031234567");
    expect(isValidNigerianPhone("12345")).toBe(false);
  });
});

describe("app/lib/slot-hold", () => {
  it("holds a slot for 10 minutes and releases after expiry", () => {
    const store = getSlotHoldStore();
    const key = {
      tenantId: "tenant-1",
      serviceId: "service-1",
      startsAt: STARTS_AT,
    };

    const first = store.tryAcquire(key, "session-a");
    expect(first.ok).toBe(true);
    if (first.ok) {
      expect(first.expiresAt).toBe(state.now + SLOT_HOLD_TTL_MS);
    }

    const blocked = store.tryAcquire(key, "session-b");
    expect(blocked.ok).toBe(false);

    state.now += SLOT_HOLD_TTL_MS;
    expect(store.releaseExpired(state.now)).toBeGreaterThan(0);

    const afterExpiry = store.tryAcquire(key, "session-b");
    expect(afterExpiry.ok).toBe(true);
  });
});

describe("public booking flow", () => {
  it("creates a booking with status pending_payment", async () => {
    const res = await POST(jsonRequest(bookingBody()));
    expect(res.status).toBe(201);

    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.booking.status).toBe(PUBLIC_BOOKING_STATUS);
    expect(body.booking.status).toBe("pending_payment");
    expect(body.booking.serviceId).toBe("service-1");
    expect(body.sessionId).toBe("session-a");
    expect(body.holdExpiresAt).toBe(new Date(state.now + SLOT_HOLD_TTL_MS).toISOString());
    expect(state.bookings).toHaveLength(1);
    expect(state.clients[0]?.phone).toBe("+2348031234567");
  });

  it("returns HTTP 409 when a second session requests the held slot", async () => {
    const first = await POST(jsonRequest(bookingBody({ sessionId: "session-a" })));
    expect(first.status).toBe(201);

    const second = await POST(jsonRequest(bookingBody({ sessionId: "session-b" })));
    expect(second.status).toBe(409);

    const body = await second.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe("slot_held");
    expect(state.bookings).toHaveLength(1);
  });

  it("releases the hold after 10 minutes so another session can book", async () => {
    const first = await createPublicBooking(bookingBody({ sessionId: "session-a" }));
    expect(first.ok).toBe(true);

    state.now += SLOT_HOLD_TTL_MS;
    expect(getSlotHoldStore().releaseExpired(state.now)).toBeGreaterThan(0);
    expect(
      getSlotHoldStore().isHeld({
        tenantId: "tenant-1",
        serviceId: "service-1",
        startsAt: new Date(STARTS_AT).toISOString(),
      })
    ).toBe(false);

    const second = await POST(jsonRequest(bookingBody({ sessionId: "session-b" })));
    expect(second.status).toBe(201);
    const body = await second.json();
    expect(body.booking.status).toBe("pending_payment");
    expect(body.sessionId).toBe("session-b");
    expect(state.bookings.some((row) => row.status === "cancelled")).toBe(true);
  });

  it("rejects invalid Nigerian phone numbers", async () => {
    const res = await POST(jsonRequest(bookingBody({ phone: "12345" })));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("invalid_phone");
    expect(state.bookings).toHaveLength(0);
  });
});
