import { execFileSync } from "node:child_process";
import path from "node:path";

import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/app/db/prisma";
import { POST } from "@/app/api/public/bookings/route";
import {
  createPublicBooking,
  PUBLIC_BOOKING_STATUS,
} from "@/app/api/public/bookings/create-public-booking";
import { isValidNigerianPhone, validateNigerianPhone } from "@/app/lib/phone";
import {
  SLOT_HOLD_TTL_MS,
  __resetSlotHoldClockForTests,
  __setSlotHoldClockForTests,
  bookingSlotLock,
  currentHoldTime,
  releaseExpiredHolds,
  tryAcquireHold,
} from "@/app/lib/slot-hold";
import { runWithTenantContext } from "@/app/tenancy/tenant-context";

const STARTS_AT = "2026-07-27T10:00:00.000Z";
const STARTS_AT_DATE = new Date(STARTS_AT);

type Seed = {
  tenantId: string;
  serviceId: string;
};

let seed: Seed;
let clockNow = 1_700_000_000_000;

function applyMigrations() {
  const prismaBin = path.join(process.cwd(), "node_modules", ".bin", "prisma");
  execFileSync(prismaBin, ["migrate", "deploy"], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "pipe",
  });
}

async function resetBookingTables(tenantId: string) {
  await runWithTenantContext({ tenantId }, async () => {
    await prisma.slotHold.deleteMany({ where: { tenantId } });
    await prisma.payment.deleteMany({ where: { tenantId } });
    await prisma.booking.deleteMany({ where: { tenantId } });
    await prisma.client.deleteMany({ where: { tenantId } });
  });
}

async function ensureSeed(): Promise<Seed> {
  const tenant = await prisma.tenant.upsert({
    where: { slug: "demo-public-booking" },
    update: {
      name: "Public Booking Test Salon",
      timezone: "Africa/Lagos",
      currency: "NGN",
    },
    create: {
      slug: "demo-public-booking",
      name: "Public Booking Test Salon",
      timezone: "Africa/Lagos",
      currency: "NGN",
    },
  });

  const existing = await runWithTenantContext({ tenantId: tenant.id }, () =>
    prisma.service.findFirst({
      where: { tenantId: tenant.id, name: "Classic Haircut" },
    })
  );

  const service =
    existing ??
    (await runWithTenantContext({ tenantId: tenant.id }, () =>
      prisma.service.create({
        data: {
          tenantId: tenant.id,
          name: "Classic Haircut",
          description: "Test service",
          durationMinutes: 30,
          priceCents: 5000,
          currency: "NGN",
          active: true,
        },
      })
    ));

  return { tenantId: tenant.id, serviceId: service.id };
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
    slug: "demo-public-booking",
    serviceId: seed.serviceId,
    startsAt: STARTS_AT,
    customerName: "Ada Okonkwo",
    phone: "08031234567",
    sessionId: "session-a",
    ...overrides,
  };
}

beforeAll(async () => {
  applyMigrations();
  seed = await ensureSeed();
});

afterAll(async () => {
  __resetSlotHoldClockForTests();
  await prisma.$disconnect();
});

beforeEach(async () => {
  clockNow = 1_700_000_000_000;
  __setSlotHoldClockForTests({ now: () => clockNow });
  await resetBookingTables(seed.tenantId);
});

describe("app/lib/phone", () => {
  it("validates and normalizes Nigerian numbers", () => {
    expect(isValidNigerianPhone("08031234567")).toBe(true);
    expect(validateNigerianPhone("08031234567")).toBe("+2348031234567");
    expect(isValidNigerianPhone("12345")).toBe(false);
  });
});

describe("app/lib/slot-hold (database-backed)", () => {
  it("persists a hold with expiresAt and releases after expiry via cleanup", async () => {
    await runWithTenantContext({ tenantId: seed.tenantId }, async () => {
      const key = {
        tenantId: seed.tenantId,
        serviceId: seed.serviceId,
        startsAt: STARTS_AT_DATE,
      };

      const first = await tryAcquireHold(prisma, key, "session-a");
      expect(first.ok).toBe(true);
      if (first.ok) {
        expect(first.expiresAt.getTime()).toBe(clockNow + SLOT_HOLD_TTL_MS);
      }

      const stored = await prisma.slotHold.findFirst({
        where: {
          tenantId: seed.tenantId,
          serviceId: seed.serviceId,
          startsAt: STARTS_AT_DATE,
        },
      });
      expect(stored).not.toBeNull();
      expect(stored?.sessionId).toBe("session-a");
      expect(stored?.expiresAt.getTime()).toBe(clockNow + SLOT_HOLD_TTL_MS);

      const blocked = await tryAcquireHold(prisma, key, "session-b");
      expect(blocked.ok).toBe(false);

      clockNow += SLOT_HOLD_TTL_MS;
      const released = await releaseExpiredHolds(prisma, seed.tenantId, currentHoldTime());
      expect(released).toBeGreaterThan(0);

      const afterExpiry = await tryAcquireHold(prisma, key, "session-b");
      expect(afterExpiry.ok).toBe(true);
    });
  });
});

describe("public booking integration", () => {
  it("persists a booking with status pending_payment (reads from DB after API)", async () => {
    const res = await POST(jsonRequest(bookingBody()));
    expect(res.status).toBe(201);

    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.booking.status).toBe(PUBLIC_BOOKING_STATUS);
    expect(body.sessionId).toBe("session-a");

    const persisted = await runWithTenantContext({ tenantId: seed.tenantId }, () =>
      prisma.booking.findFirst({
        where: { tenantId: seed.tenantId, id: body.booking.id },
      })
    );

    expect(persisted).not.toBeNull();
    expect(persisted?.status).toBe("pending_payment");
    expect(persisted?.serviceId).toBe(seed.serviceId);
    expect(persisted?.slotLock).toBe(bookingSlotLock(seed.serviceId, STARTS_AT_DATE));

    const clients = await runWithTenantContext({ tenantId: seed.tenantId }, () =>
      prisma.client.findMany({ where: { tenantId: seed.tenantId } })
    );
    expect(clients).toHaveLength(1);
    expect(clients[0]?.phone).toBe("+2348031234567");
  });

  it("returns HTTP 409 for a conflicting active hold and does not create a second booking", async () => {
    const first = await POST(jsonRequest(bookingBody({ sessionId: "session-a" })));
    expect(first.status).toBe(201);

    const second = await POST(jsonRequest(bookingBody({ sessionId: "session-b" })));
    expect(second.status).toBe(409);

    const body = await second.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe("slot_held");

    const bookings = await runWithTenantContext({ tenantId: seed.tenantId }, () =>
      prisma.booking.findMany({
        where: {
          tenantId: seed.tenantId,
          serviceId: seed.serviceId,
          startsAt: STARTS_AT_DATE,
          status: { not: "cancelled" },
        },
      })
    );
    expect(bookings).toHaveLength(1);
  });

  it("handles two concurrent booking attempts: one succeeds, one returns 409, one DB row", async () => {
    const [a, b] = await Promise.all([
      createPublicBooking(bookingBody({ sessionId: "race-a", phone: "08031234567" })),
      createPublicBooking(bookingBody({ sessionId: "race-b", phone: "08039876543" })),
    ]);

    const outcomes = [a, b];
    const successes = outcomes.filter((row) => row.ok);
    const conflicts = outcomes.filter((row) => !row.ok && row.status === 409);

    expect(successes).toHaveLength(1);
    expect(conflicts).toHaveLength(1);

    const bookings = await runWithTenantContext({ tenantId: seed.tenantId }, () =>
      prisma.booking.findMany({
        where: {
          tenantId: seed.tenantId,
          serviceId: seed.serviceId,
          startsAt: STARTS_AT_DATE,
          status: { not: "cancelled" },
        },
      })
    );
    expect(bookings).toHaveLength(1);
    expect(bookings[0]?.status).toBe("pending_payment");
  });

  it("allows rebooking after a persisted hold expires (time advanced past 10 minutes)", async () => {
    const first = await createPublicBooking(bookingBody({ sessionId: "session-a" }));
    expect(first.ok).toBe(true);

    const holdBefore = await runWithTenantContext({ tenantId: seed.tenantId }, () =>
      prisma.slotHold.findFirst({
        where: {
          tenantId: seed.tenantId,
          serviceId: seed.serviceId,
          startsAt: STARTS_AT_DATE,
        },
      })
    );
    expect(holdBefore).not.toBeNull();
    expect(holdBefore?.expiresAt.getTime()).toBe(clockNow + SLOT_HOLD_TTL_MS);

    // Advance mocked clock beyond the persisted expiration timestamp. Cleanup
    // in the booking flow uses expiresAt — no manual hold deletion here.
    clockNow += SLOT_HOLD_TTL_MS + 1;

    const second = await POST(
      jsonRequest(
        bookingBody({
          sessionId: "session-b",
          phone: "08035551234",
          customerName: "Bola Ade",
        })
      )
    );
    expect(second.status).toBe(201);
    const body = await second.json();
    expect(body.booking.status).toBe("pending_payment");
    expect(body.sessionId).toBe("session-b");

    const active = await runWithTenantContext({ tenantId: seed.tenantId }, () =>
      prisma.booking.findMany({
        where: {
          tenantId: seed.tenantId,
          serviceId: seed.serviceId,
          startsAt: STARTS_AT_DATE,
          status: { not: "cancelled" },
        },
      })
    );
    expect(active).toHaveLength(1);
    expect(active[0]?.id).toBe(body.booking.id);

    const cancelled = await runWithTenantContext({ tenantId: seed.tenantId }, () =>
      prisma.booking.findMany({
        where: {
          tenantId: seed.tenantId,
          serviceId: seed.serviceId,
          startsAt: STARTS_AT_DATE,
          status: "cancelled",
        },
      })
    );
    expect(cancelled.length).toBeGreaterThanOrEqual(1);
  });

  it("rejects invalid Nigerian phone numbers", async () => {
    const res = await POST(jsonRequest(bookingBody({ phone: "12345" })));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("invalid_phone");

    const bookings = await runWithTenantContext({ tenantId: seed.tenantId }, () =>
      prisma.booking.findMany({ where: { tenantId: seed.tenantId } })
    );
    expect(bookings).toHaveLength(0);
  });

  it("maps booking slotLock unique violations to HTTP 409", async () => {
    await runWithTenantContext({ tenantId: seed.tenantId }, async () => {
      const client = await prisma.client.create({
        data: {
          tenantId: seed.tenantId,
          name: "Existing",
          phone: "+2348011111111",
        },
      });
      await prisma.booking.create({
        data: {
          tenantId: seed.tenantId,
          clientId: client.id,
          serviceId: seed.serviceId,
          startsAt: STARTS_AT_DATE,
          endsAt: new Date(STARTS_AT_DATE.getTime() + 30 * 60_000),
          status: "confirmed",
          slotLock: bookingSlotLock(seed.serviceId, STARTS_AT_DATE),
        },
      });
    });

    const res = await POST(jsonRequest(bookingBody({ sessionId: "session-x" })));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(["slot_unavailable", "slot_held"]).toContain(body.error);
  });
});
