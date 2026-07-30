import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
  createdAt: Date;
  updatedAt: Date;
};

type AuditLogRow = {
  id: string;
  tenantId: string;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: string | null;
  createdAt: Date;
};

type BusinessHourRow = {
  id: string;
  tenantId: string;
  dayOfWeek: number;
  opensAt: string;
  closesAt: string;
  isClosed: boolean;
};

type NextRequestInit = NonNullable<ConstructorParameters<typeof NextRequest>[1]>;

const state = vi.hoisted(() => ({
  bookings: [] as BookingRow[],
  auditLogs: [] as AuditLogRow[],
  businessHours: [] as BusinessHourRow[],
  findBookingFirst: vi.fn(),
  findBookingMany: vi.fn(),
  createBooking: vi.fn(),
  updateBooking: vi.fn(),
  createAuditLog: vi.fn(),
  transaction: vi.fn(),
  findBusinessHourFirst: vi.fn(),
  findBlackoutDateFirst: vi.fn(),
  tenantFindUnique: vi.fn(),
}));

vi.mock("@/app/db/prisma", () => ({
  prisma: {
    booking: {
      findFirst: state.findBookingFirst,
      findMany: state.findBookingMany,
      create: state.createBooking,
      update: state.updateBooking,
    },
    auditLog: {
      create: state.createAuditLog,
    },
    $transaction: state.transaction,
    businessHour: {
      findFirst: state.findBusinessHourFirst,
    },
    blackoutDate: {
      findFirst: state.findBlackoutDateFirst,
    },
    tenant: {
      findUnique: state.tenantFindUnique,
    },
  },
}));

import { GET, POST } from "@/app/api/bookings/route";
import { PATCH } from "@/app/api/bookings/[id]/route";

function booking(overrides: Partial<BookingRow> = {}): BookingRow {
  return {
    id: "booking-1",
    tenantId: "tenant-1",
    clientId: "client-1",
    serviceId: "service-1",
    staffId: "staff-1",
    startsAt: new Date("2026-07-27T10:00:00.000Z"),
    endsAt: new Date("2026-07-27T11:00:00.000Z"),
    status: "confirmed",
    notes: null,
    createdAt: new Date("2026-07-01T10:00:00.000Z"),
    updatedAt: new Date("2026-07-01T10:00:00.000Z"),
    ...overrides,
  };
}

function request(path: string, body: unknown, init: NextRequestInit = {}) {
  const method = init.method ?? "PATCH";
  return new NextRequest(`http://app.test${path}`, {
    ...init,
    method,
    headers: {
      "content-type": "application/json",
      "x-tenant-id": "tenant-1",
      ...(init.headers as Record<string, string> | undefined),
    },
    body: method === "GET" || method === "HEAD" ? undefined : JSON.stringify(body),
  });
}

beforeEach(() => {
  state.bookings = [booking()];
  state.auditLogs = [];
  state.businessHours = [
    {
      id: "hours-1",
      tenantId: "tenant-1",
      dayOfWeek: 1,
      opensAt: "09:00",
      closesAt: "17:00",
      isClosed: false,
    },
  ];

  state.findBookingFirst.mockReset();
  state.findBookingMany.mockReset();
  state.createBooking.mockReset();
  state.updateBooking.mockReset();
  state.createAuditLog.mockReset();
  state.transaction.mockReset();
  state.findBusinessHourFirst.mockReset();
  state.findBlackoutDateFirst.mockReset();
  state.tenantFindUnique.mockReset();

  state.findBookingFirst.mockImplementation(
    async (args: { where: { tenantId: string; id: string } }) =>
      state.bookings.find(
        (row) => row.tenantId === args.where.tenantId && row.id === args.where.id
      ) ?? null
  );
  state.findBookingMany.mockImplementation(
    async (args: {
      where: {
        tenantId: string;
        id?: { not: string };
        staffId: string | null;
        startsAt?: { lt: Date };
        endsAt?: { gt: Date };
      };
      take: number;
      orderBy?: unknown;
    }) => {
      let rows = state.bookings.filter((row) => row.tenantId === args.where.tenantId);
      if (args.where.id) {
        rows = rows.filter((row) => row.id !== args.where.id?.not);
      }
      if ("staffId" in args.where) {
        rows = rows.filter((row) => row.staffId === args.where.staffId);
      }
      if (args.where.startsAt) {
        rows = rows.filter((row) => row.startsAt < args.where.startsAt!.lt);
      }
      if (args.where.endsAt) {
        rows = rows.filter((row) => row.endsAt > args.where.endsAt!.gt);
      }

      return rows.slice(0, args.take ?? rows.length);
    }
  );
  state.createBooking.mockImplementation(
    async (args: { data: Omit<BookingRow, "id" | "createdAt" | "updatedAt"> }) => {
      if (
        args.data.staffId &&
        state.bookings.some(
          (row) =>
            row.tenantId === args.data.tenantId &&
            row.staffId === args.data.staffId &&
            row.startsAt < args.data.endsAt &&
            row.endsAt > args.data.startsAt
        )
      ) {
        throw new Error("booking_staff_overlap");
      }

      const row = booking({
        id: `booking-${state.bookings.length + 1}`,
        ...args.data,
        createdAt: new Date("2026-07-27T12:00:00.000Z"),
        updatedAt: new Date("2026-07-27T12:00:00.000Z"),
      });
      state.bookings.push(row);
      return row;
    }
  );
  state.updateBooking.mockImplementation(
    async (args: { where: { id: string }; data: Partial<BookingRow> }) => {
      const index = state.bookings.findIndex((row) => row.id === args.where.id);
      if (index === -1) {
        throw Object.assign(new Error("Record not found"), { code: "P2025" });
      }

      const row = booking({
        ...state.bookings[index],
        ...args.data,
        updatedAt: new Date("2026-07-27T12:00:00.000Z"),
      });
      state.bookings[index] = row;
      return row;
    }
  );
  state.createAuditLog.mockImplementation(
    async (args: { data: Omit<AuditLogRow, "id" | "createdAt"> }) => {
      const row = {
        id: `audit-${state.auditLogs.length + 1}`,
        createdAt: new Date("2026-07-27T12:00:00.000Z"),
        ...args.data,
      };
      state.auditLogs.push(row);
      return row;
    }
  );
  state.transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) =>
    callback({
      booking: {
        create: state.createBooking,
      },
      auditLog: {
        create: state.createAuditLog,
      },
    })
  );
  state.findBusinessHourFirst.mockImplementation(
    async (args: { where: { tenantId: string; dayOfWeek: number } }) =>
      state.businessHours.find(
        (row) => row.tenantId === args.where.tenantId && row.dayOfWeek === args.where.dayOfWeek
      ) ?? null
  );
  state.findBlackoutDateFirst.mockResolvedValue(null);
});

describe("GET /api/bookings", () => {
  it("lists bookings scoped to the request tenant for calendar refreshes", async () => {
    state.bookings.push(booking({ id: "booking-2", tenantId: "tenant-2" }));

    const res = await GET(request("/api/bookings", {}, { method: "GET" }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.bookings).toHaveLength(1);
    expect(body.bookings[0]).toMatchObject({
      id: "booking-1",
      tenantId: "tenant-1",
      startsAt: "2026-07-27T10:00:00.000Z",
      endsAt: "2026-07-27T11:00:00.000Z",
    });
    expect(state.findBookingMany).toHaveBeenCalledWith({
      where: { tenantId: "tenant-1" },
      orderBy: [{ startsAt: "asc" }, { createdAt: "asc" }],
    });
  });
});

describe("POST /api/bookings", () => {
  it("creates a manual booking, returns it for immediate calendar use, and writes an audit log", async () => {
    const res = await POST(
      request("/api/bookings", {
        clientId: "client-2",
        serviceId: "service-1",
        staffId: "staff-1",
        startsAt: "2026-07-27T11:30:00.000Z",
        endsAt: "2026-07-27T12:00:00.000Z",
        notes: "Walk-in",
      })
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.booking).toMatchObject({
      id: "booking-2",
      tenantId: "tenant-1",
      clientId: "client-2",
      serviceId: "service-1",
      staffId: "staff-1",
      startsAt: "2026-07-27T11:30:00.000Z",
      endsAt: "2026-07-27T12:00:00.000Z",
      status: "confirmed",
      notes: "Walk-in",
    });
    expect(state.transaction).toHaveBeenCalledOnce();
    expect(state.createAuditLog).toHaveBeenCalledWith({
      data: {
        tenantId: "tenant-1",
        action: "manual_booking_created",
        entityType: "Booking",
        entityId: "booking-2",
        metadata: JSON.stringify({
          clientId: "client-2",
          serviceId: "service-1",
          staffId: "staff-1",
          startsAt: "2026-07-27T11:30:00.000Z",
          endsAt: "2026-07-27T12:00:00.000Z",
        }),
      },
    });

    const calendarRes = await GET(request("/api/bookings", {}, { method: "GET" }));
    const calendarBody = await calendarRes.json();
    expect(calendarBody.bookings.map((row: BookingRow) => row.id)).toContain("booking-2");
  });

  it("rejects overlapping manual bookings before insert", async () => {
    const res = await POST(
      request("/api/bookings", {
        clientId: "client-2",
        serviceId: "service-1",
        staffId: "staff-1",
        startsAt: "2026-07-27T10:30:00.000Z",
        endsAt: "2026-07-27T11:30:00.000Z",
      })
    );

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("BOOKING_OVERLAP");
    expect(state.createBooking).not.toHaveBeenCalled();
    expect(state.createAuditLog).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/bookings/:id", () => {
  it("rejects a startsAt-only update when the merged interval is outside business hours", async () => {
    const res = await PATCH(
      request("/api/bookings/booking-1", { startsAt: "2026-07-27T08:30:00.000Z" }),
      { params: { id: "booking-1" } }
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("OUTSIDE_BUSINESS_HOURS");
    expect(body.message).toContain("outside configured business hours");
    expect(state.findBookingMany).not.toHaveBeenCalled();
    expect(state.updateBooking).not.toHaveBeenCalled();
  });

  it("rejects an endsAt-only update when the merged interval is outside business hours", async () => {
    const res = await PATCH(
      request("/api/bookings/booking-1", { endsAt: "2026-07-27T17:30:00.000Z" }),
      { params: { id: "booking-1" } }
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("OUTSIDE_BUSINESS_HOURS");
    expect(body.message).toContain("outside configured business hours");
    expect(state.findBookingMany).not.toHaveBeenCalled();
    expect(state.updateBooking).not.toHaveBeenCalled();
  });

  it("rejects a startsAt-only update when the merged interval overlaps another booking", async () => {
    state.bookings.push(
      booking({
        id: "booking-2",
        startsAt: new Date("2026-07-27T09:30:00.000Z"),
        endsAt: new Date("2026-07-27T10:15:00.000Z"),
      })
    );

    const res = await PATCH(
      request("/api/bookings/booking-1", { startsAt: "2026-07-27T09:45:00.000Z" }),
      { params: { id: "booking-1" } }
    );

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("BOOKING_OVERLAP");
    expect(body.message).toContain("overlaps with another booking");
    expect(state.findBookingMany).toHaveBeenCalledWith({
      where: {
        tenantId: "tenant-1",
        id: { not: "booking-1" },
        staffId: "staff-1",
        startsAt: { lt: new Date("2026-07-27T11:00:00.000Z") },
        endsAt: { gt: new Date("2026-07-27T09:45:00.000Z") },
      },
      take: 1,
    });
    expect(state.updateBooking).not.toHaveBeenCalled();
  });

  it("rejects an endsAt-only update when the merged interval overlaps another booking", async () => {
    state.bookings = [
      booking({
        startsAt: new Date("2026-07-27T09:00:00.000Z"),
        endsAt: new Date("2026-07-27T10:00:00.000Z"),
      }),
      booking({
        id: "booking-2",
        startsAt: new Date("2026-07-27T10:30:00.000Z"),
        endsAt: new Date("2026-07-27T11:30:00.000Z"),
      }),
    ];

    const res = await PATCH(
      request("/api/bookings/booking-1", { endsAt: "2026-07-27T11:00:00.000Z" }),
      { params: { id: "booking-1" } }
    );

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("BOOKING_OVERLAP");
    expect(body.message).toContain("overlaps with another booking");
    expect(state.findBookingMany).toHaveBeenCalledWith({
      where: {
        tenantId: "tenant-1",
        id: { not: "booking-1" },
        staffId: "staff-1",
        startsAt: { lt: new Date("2026-07-27T11:00:00.000Z") },
        endsAt: { gt: new Date("2026-07-27T09:00:00.000Z") },
      },
      take: 1,
    });
    expect(state.updateBooking).not.toHaveBeenCalled();
  });
});
