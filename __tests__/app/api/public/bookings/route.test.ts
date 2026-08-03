import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type BookingRow = {
  id: string;
  tenantId: string;
  clientId: string;
  serviceId: string;
  staffId: string | null;
  startsAt: Date;
  endsAt: Date;
  status: string;
  isSlotHold: boolean;
  holdExpiresAt: Date | null;
  slotHoldKey: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type ClientRow = {
  id: string;
  tenantId: string;
  name: string;
  phone: string;
  email: string | null;
};

type FindManyArgs = {
  where: {
    tenantId: string;
    id: { not: string };
    staffId: string | null;
    startsAt: { lt: Date };
    endsAt: { gt: Date };
    status: { in: string[] };
    OR: [{ status: string }, { isSlotHold: true; holdExpiresAt: { gt: Date } }];
  };
  take: number;
};

const state = vi.hoisted(() => ({
  tenants: [{ id: "tenant-1", slug: "demo" }],
  services: [{ id: "service-1", tenantId: "tenant-1", active: true, durationMinutes: 60 }],
  clients: [] as ClientRow[],
  bookings: [] as BookingRow[],
  transaction: vi.fn(),
  tenantFindUnique: vi.fn(),
  serviceFindFirst: vi.fn(),
  clientUpsert: vi.fn(),
  bookingFindMany: vi.fn(),
  bookingUpdateMany: vi.fn(),
  bookingCreate: vi.fn(),
  businessHourFindFirst: vi.fn(),
  blackoutDateFindFirst: vi.fn(),
}));

vi.mock("@/app/db/prisma", () => ({
  prisma: {
    $transaction: state.transaction,
  },
}));

import { POST } from "@/app/api/public/bookings/route";

function booking(overrides: Partial<BookingRow> = {}): BookingRow {
  return {
    id: "booking-1",
    tenantId: "tenant-1",
    clientId: "client-1",
    serviceId: "service-1",
    staffId: null,
    startsAt: new Date("2026-08-10T09:00:00.000Z"),
    endsAt: new Date("2026-08-10T10:00:00.000Z"),
    status: "pending_payment",
    isSlotHold: true,
    holdExpiresAt: new Date("2026-08-10T08:10:00.000Z"),
    slotHoldKey: "tenant-1:public:2026-08-10T09:00:00.000Z:2026-08-10T10:00:00.000Z",
    notes: null,
    createdAt: new Date("2026-08-10T08:00:00.000Z"),
    updatedAt: new Date("2026-08-10T08:00:00.000Z"),
    ...overrides,
  };
}

function request(body: unknown) {
  return new NextRequest("http://app.test/api/public/bookings", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    tenantSlug: "demo",
    serviceId: "service-1",
    startsAt: "2026-08-10T09:00:00.000Z",
    endsAt: "2026-08-10T10:00:00.000Z",
    client: {
      name: "Ada Lovelace",
      phone: "+2348012345678",
      email: "ada@example.com",
    },
    notes: "Near the window",
    ...overrides,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-10T08:00:00.000Z"));

  state.clients = [];
  state.bookings = [];

  state.transaction.mockReset();
  state.tenantFindUnique.mockReset();
  state.serviceFindFirst.mockReset();
  state.clientUpsert.mockReset();
  state.bookingFindMany.mockReset();
  state.bookingUpdateMany.mockReset();
  state.bookingCreate.mockReset();
  state.businessHourFindFirst.mockReset();
  state.blackoutDateFindFirst.mockReset();

  const tx = {
    tenant: { findUnique: state.tenantFindUnique },
    service: { findFirst: state.serviceFindFirst },
    client: { upsert: state.clientUpsert },
    booking: {
      findMany: state.bookingFindMany,
      updateMany: state.bookingUpdateMany,
      create: state.bookingCreate,
    },
    businessHour: { findFirst: state.businessHourFindFirst },
    blackoutDate: { findFirst: state.blackoutDateFindFirst },
  };

  state.transaction.mockImplementation(async (callback) => callback(tx));
  state.tenantFindUnique.mockImplementation(
    async (args: { where: { slug: string } }) =>
      state.tenants.find((tenant) => tenant.slug === args.where.slug) ?? null
  );
  state.serviceFindFirst.mockImplementation(
    async (args: { where: { tenantId: string; id: string; active: true } }) =>
      state.services.find(
        (service) =>
          service.tenantId === args.where.tenantId &&
          service.id === args.where.id &&
          service.active === args.where.active
      ) ?? null
  );
  state.clientUpsert.mockImplementation(
    async (args: {
      where: { tenantId_phone: { tenantId: string; phone: string } };
      create: ClientRow;
      update: Partial<ClientRow>;
    }) => {
      const existing = state.clients.find(
        (client) =>
          client.tenantId === args.where.tenantId_phone.tenantId &&
          client.phone === args.where.tenantId_phone.phone
      );
      if (existing) {
        Object.assign(existing, args.update);
        return existing;
      }

      const client = { ...args.create, id: `client-${state.clients.length + 1}` };
      state.clients.push(client);
      return client;
    }
  );
  state.bookingFindMany.mockImplementation(async (args: FindManyArgs) =>
    state.bookings
      .filter((row) => {
        const hasBlockingStatus = args.where.status.in.includes(row.status);
        const isConfirmed = row.status === args.where.OR[0].status;
        const isActiveHold =
          row.isSlotHold &&
          row.holdExpiresAt !== null && row.holdExpiresAt > args.where.OR[1].holdExpiresAt.gt;

        return (
          row.tenantId === args.where.tenantId &&
          row.id !== args.where.id.not &&
          row.staffId === args.where.staffId &&
          row.startsAt < args.where.startsAt.lt &&
          row.endsAt > args.where.endsAt.gt &&
          hasBlockingStatus &&
          (isConfirmed || isActiveHold)
        );
      })
      .slice(0, args.take)
  );
  state.bookingUpdateMany.mockImplementation(
    async (args: {
      where: {
        tenantId: string;
        status: string;
        isSlotHold: boolean;
        holdExpiresAt: { lte: Date };
        slotHoldKey: { not: null };
      };
      data: { slotHoldKey: null };
    }) => {
      let count = 0;
      for (const row of state.bookings) {
        if (
          row.tenantId === args.where.tenantId &&
          row.status === args.where.status &&
          row.isSlotHold === args.where.isSlotHold &&
          row.holdExpiresAt !== null &&
          row.holdExpiresAt <= args.where.holdExpiresAt.lte &&
          row.slotHoldKey !== args.where.slotHoldKey.not
        ) {
          row.slotHoldKey = args.data.slotHoldKey;
          count += 1;
        }
      }

      return { count };
    }
  );
  state.bookingCreate.mockImplementation(
    async (args: { data: Omit<BookingRow, "id" | "createdAt" | "updatedAt"> }) => {
      const row = booking({
        id: `booking-${state.bookings.length + 1}`,
        ...args.data,
      });
      state.bookings.push(row);
      return row;
    }
  );
  state.businessHourFindFirst.mockResolvedValue({
    opensAt: "09:00",
    closesAt: "17:00",
    isClosed: false,
  });
  state.blackoutDateFindFirst.mockResolvedValue(null);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("POST /api/public/bookings", () => {
  it("creates a pending-payment booking with a 10-minute hold expiry", async () => {
    const res = await POST(request(validPayload()));

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.booking).toMatchObject({
      tenantId: "tenant-1",
      clientId: "client-1",
      serviceId: "service-1",
      status: "pending_payment",
      holdExpiresAt: "2026-08-10T08:10:00.000Z",
      isSlotHold: true,
    });
    expect(body.holdExpiresAt).toBe("2026-08-10T08:10:00.000Z");
    expect(state.bookingCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: "pending_payment",
        isSlotHold: true,
        holdExpiresAt: new Date("2026-08-10T08:10:00.000Z"),
        slotHoldKey: "tenant-1:public:2026-08-10T09:00:00.000Z:2026-08-10T10:00:00.000Z",
      }),
    });
    expect(state.bookingUpdateMany).toHaveBeenCalledWith({
      where: {
        tenantId: "tenant-1",
        status: "pending_payment",
        isSlotHold: true,
        holdExpiresAt: { lte: new Date("2026-08-10T08:00:00.000Z") },
        slotHoldKey: { not: null },
      },
      data: { slotHoldKey: null },
    });
  });

  it("blocks an overlapping active hold from another session", async () => {
    state.bookings.push(booking({ id: "held-booking" }));

    const res = await POST(request(validPayload()));

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("BOOKING_OVERLAP");
    expect(state.bookingCreate).not.toHaveBeenCalled();
    expect(state.bookingFindMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        tenantId: "tenant-1",
        status: { in: ["confirmed", "pending_payment"] },
        OR: [
          { status: "confirmed" },
          { isSlotHold: true, holdExpiresAt: { gt: new Date("2026-08-10T08:00:00.000Z") } },
        ],
      }),
      take: 1,
    });
  });

  it("blocks an overlapping confirmed booking without requiring a hold expiry", async () => {
    state.bookings.push(
      booking({
        id: "confirmed-booking",
        status: "confirmed",
        isSlotHold: false,
        holdExpiresAt: null,
        slotHoldKey: null,
      })
    );

    const res = await POST(request(validPayload()));

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("BOOKING_OVERLAP");
    expect(state.bookingCreate).not.toHaveBeenCalled();
  });

  it("does not block a slot with an overlapping non-blocking booking status", async () => {
    state.bookings.push(
      booking({
        id: "cancelled-booking",
        status: "cancelled",
        isSlotHold: false,
        holdExpiresAt: new Date("2026-08-10T08:10:00.000Z"),
        slotHoldKey: null,
      })
    );

    const res = await POST(request(validPayload()));

    expect(res.status).toBe(201);
    expect(state.bookingCreate).toHaveBeenCalledOnce();
  });

  it("returns an overlap conflict when a racing request wins the slot hold key", async () => {
    state.bookingCreate.mockRejectedValueOnce(
      Object.assign(new Error("Unique constraint failed"), { code: "P2002" })
    );

    const res = await POST(request(validPayload()));

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body).toMatchObject({
      ok: false,
      error: "BOOKING_OVERLAP",
      message: "Booking overlaps with another booking for the selected time.",
    });
    expect(state.bookingCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        slotHoldKey: "tenant-1:public:2026-08-10T09:00:00.000Z:2026-08-10T10:00:00.000Z",
        isSlotHold: true,
      }),
    });
  });

  it("does not block a slot with an ordinary pending-payment booking that is not a hold", async () => {
    state.bookings.push(
      booking({
        id: "pending-payment-booking",
        isSlotHold: false,
        holdExpiresAt: new Date("2026-08-10T08:10:00.000Z"),
        slotHoldKey: null,
      })
    );

    const res = await POST(request(validPayload()));

    expect(res.status).toBe(201);
    expect(state.bookingCreate).toHaveBeenCalledOnce();
  });

  it("allows a slot when the only overlapping hold has expired", async () => {
    state.bookings.push(
      booking({
        id: "expired-hold",
        holdExpiresAt: new Date("2026-08-10T07:59:59.000Z"),
      })
    );

    const res = await POST(request(validPayload()));

    expect(res.status).toBe(201);
    expect(state.bookingCreate).toHaveBeenCalledOnce();
    expect(state.bookings.find((row) => row.id === "expired-hold")?.slotHoldKey).toBeNull();
  });

  it("rejects invalid Nigerian phone numbers before opening a transaction", async () => {
    const res = await POST(
      request(
        validPayload({
          client: {
            name: "Ada Lovelace",
            phone: "12345",
            email: null,
          },
        })
      )
    );

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.fieldErrors.client).toContain("Enter a valid Nigerian phone number");
    expect(state.transaction).not.toHaveBeenCalled();
  });
});
