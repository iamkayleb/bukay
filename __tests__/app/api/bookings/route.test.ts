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

type BusinessHourRow = {
  id: string;
  tenantId: string;
  dayOfWeek: number;
  opensAt: string;
  closesAt: string;
  isClosed: boolean;
};

type ServiceRow = {
  id: string;
  tenantId: string;
  durationMinutes: number;
  active: boolean;
};

type NextRequestInit = NonNullable<ConstructorParameters<typeof NextRequest>[1]>;
type CreateBookingData = Omit<BookingRow, "id" | "createdAt" | "updatedAt">;

const state = vi.hoisted(() => ({
  bookings: [] as BookingRow[],
  businessHours: [] as BusinessHourRow[],
  services: [] as ServiceRow[],
  findBookingFirst: vi.fn(),
  findBookingMany: vi.fn(),
  createBooking: vi.fn(),
  updateBooking: vi.fn(),
  findServiceFirst: vi.fn(),
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
    service: {
      findFirst: state.findServiceFirst,
    },
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

import { POST } from "@/app/api/bookings/route";
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

function service(overrides: Partial<ServiceRow> = {}): ServiceRow {
  return {
    id: "service-1",
    tenantId: "tenant-1",
    durationMinutes: 60,
    active: true,
    ...overrides,
  };
}

function request(path: string, body: unknown, init: NextRequestInit = {}) {
  return new NextRequest(`http://app.test${path}`, {
    ...init,
    method: init.method ?? "PATCH",
    headers: {
      "content-type": "application/json",
      "x-tenant-id": "tenant-1",
      ...(init.headers as Record<string, string> | undefined),
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  state.bookings = [booking()];
  state.services = [service()];
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
  state.findServiceFirst.mockReset();
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
        id: { not: string };
        staffId: string | null;
        startsAt: { lt: Date };
        endsAt: { gt: Date };
      };
      take: number;
    }) =>
      state.bookings
        .filter(
          (row) =>
            row.tenantId === args.where.tenantId &&
            row.id !== args.where.id.not &&
            row.staffId === args.where.staffId &&
            row.startsAt < args.where.startsAt.lt &&
            row.endsAt > args.where.endsAt.gt
        )
        .slice(0, args.take)
  );
  state.createBooking.mockImplementation(async (args: { data: CreateBookingData }) => {
    const row = booking({
      id: `booking-${state.bookings.length + 1}`,
      ...args.data,
    });
    state.bookings.push(row);
    return row;
  });
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
  state.findBusinessHourFirst.mockImplementation(
    async (args: { where: { tenantId: string; dayOfWeek: number } }) =>
      state.businessHours.find(
        (row) => row.tenantId === args.where.tenantId && row.dayOfWeek === args.where.dayOfWeek
      ) ?? null
  );
  state.findServiceFirst.mockImplementation(
    async (args: { where: { tenantId: string; id: string; active?: boolean } }) =>
      state.services.find(
        (row) =>
          row.tenantId === args.where.tenantId &&
          row.id === args.where.id &&
          (args.where.active === undefined || row.active === args.where.active)
      ) ?? null
  );
  state.findBlackoutDateFirst.mockResolvedValue(null);
});

describe("POST /api/bookings", () => {
  it("creates a booking only after finding an active tenant service", async () => {
    state.bookings = [];

    const res = await POST(
      request("/api/bookings", {
        clientId: "client-1",
        serviceId: "service-1",
        staffId: "staff-1",
        startsAt: "2026-07-27T10:00:00.000Z",
      })
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.booking).toMatchObject({
      tenantId: "tenant-1",
      clientId: "client-1",
      serviceId: "service-1",
      status: "pending",
    });
    expect(body.booking.endsAt).toBe("2026-07-27T11:00:00.000Z");
    expect(state.findServiceFirst).toHaveBeenCalledWith({
      where: { tenantId: "tenant-1", id: "service-1", active: true },
    });
    expect(state.createBooking).toHaveBeenCalledWith({
      data: {
        tenantId: "tenant-1",
        clientId: "client-1",
        serviceId: "service-1",
        staffId: "staff-1",
        startsAt: new Date("2026-07-27T10:00:00.000Z"),
        endsAt: new Date("2026-07-27T11:00:00.000Z"),
        status: "pending",
        notes: undefined,
      },
    });
  });

  it("rejects booking requests for archived services", async () => {
    state.services = [service({ active: false })];

    const res = await POST(
      request("/api/bookings", {
        clientId: "client-1",
        serviceId: "service-1",
        staffId: "staff-1",
        startsAt: "2026-07-27T10:00:00.000Z",
      })
    );

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("SERVICE_NOT_FOUND");
    expect(state.findServiceFirst).toHaveBeenCalledWith({
      where: { tenantId: "tenant-1", id: "service-1", active: true },
    });
    expect(state.createBooking).not.toHaveBeenCalled();
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
