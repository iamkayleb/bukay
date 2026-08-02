import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

type ServiceRow = {
  id: string;
  tenantId: string;
  durationMinutes: number;
  active: boolean;
};

type ClientRow = {
  id: string;
  tenantId: string;
  name: string;
  phone: string;
};

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

type NextRequestInit = NonNullable<ConstructorParameters<typeof NextRequest>[1]>;

const state = vi.hoisted(() => ({
  services: [] as ServiceRow[],
  clients: [] as ClientRow[],
  bookings: [] as BookingRow[],
  businessHours: [] as BusinessHourRow[],
  tenants: [{ id: "tenant-from-slug", slug: "demo" }],
  serviceFindFirst: vi.fn(),
  clientUpsert: vi.fn(),
  bookingFindMany: vi.fn(),
  bookingCreate: vi.fn(),
  businessHourFindFirst: vi.fn(),
  blackoutDateFindFirst: vi.fn(),
  tenantFindUnique: vi.fn(),
}));

vi.mock("@/app/db/prisma", () => ({
  prisma: {
    service: {
      findFirst: state.serviceFindFirst,
    },
    client: {
      upsert: state.clientUpsert,
    },
    booking: {
      findMany: state.bookingFindMany,
      create: state.bookingCreate,
    },
    businessHour: {
      findFirst: state.businessHourFindFirst,
    },
    blackoutDate: {
      findFirst: state.blackoutDateFindFirst,
    },
    tenant: {
      findUnique: state.tenantFindUnique,
    },
  },
}));

import { POST } from "@/app/api/public/bookings/route";

function service(overrides: Partial<ServiceRow> = {}): ServiceRow {
  return {
    id: "service-1",
    tenantId: "tenant-1",
    durationMinutes: 45,
    active: true,
    ...overrides,
  };
}

function booking(overrides: Partial<BookingRow> = {}): BookingRow {
  return {
    id: "booking-1",
    tenantId: "tenant-1",
    clientId: "client-1",
    serviceId: "service-1",
    staffId: "staff-1",
    startsAt: new Date("2026-07-27T10:00:00.000Z"),
    endsAt: new Date("2026-07-27T10:45:00.000Z"),
    status: "pending_payment",
    notes: null,
    createdAt: new Date("2026-07-27T09:59:00.000Z"),
    updatedAt: new Date("2026-07-27T09:59:00.000Z"),
    ...overrides,
  };
}

function request(path: string, body: unknown, init: NextRequestInit = {}) {
  return new NextRequest(`http://app.test${path}`, {
    ...init,
    method: init.method ?? "POST",
    headers: {
      "content-type": "application/json",
      "x-tenant-id": "tenant-1",
      ...(init.headers as Record<string, string> | undefined),
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  state.services = [service(), service({ id: "service-2", tenantId: "tenant-2" })];
  state.clients = [];
  state.bookings = [];
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

  state.serviceFindFirst.mockReset();
  state.clientUpsert.mockReset();
  state.bookingFindMany.mockReset();
  state.bookingCreate.mockReset();
  state.businessHourFindFirst.mockReset();
  state.blackoutDateFindFirst.mockReset();
  state.tenantFindUnique.mockReset();

  state.serviceFindFirst.mockImplementation(
    async (args: { where: { tenantId: string; id: string; active: boolean } }) =>
      state.services.find(
        (row) =>
          row.tenantId === args.where.tenantId &&
          row.id === args.where.id &&
          row.active === args.where.active
      ) ?? null
  );
  state.clientUpsert.mockImplementation(
    async (args: {
      where: { tenantId_phone: { tenantId: string; phone: string } };
      create: Omit<ClientRow, "id">;
      update: Pick<ClientRow, "name">;
    }) => {
      const index = state.clients.findIndex(
        (row) =>
          row.tenantId === args.where.tenantId_phone.tenantId &&
          row.phone === args.where.tenantId_phone.phone
      );

      if (index === -1) {
        const row = { id: `client-${state.clients.length + 1}`, ...args.create };
        state.clients.push(row);
        return row;
      }

      const row = { ...state.clients[index], ...args.update };
      state.clients[index] = row;
      return row;
    }
  );
  state.bookingFindMany.mockImplementation(
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
  state.bookingCreate.mockImplementation(
    async (args: {
      data: Omit<BookingRow, "id" | "createdAt" | "updatedAt">;
    }) => {
      const row = booking({
        id: `booking-${state.bookings.length + 1}`,
        ...args.data,
      });
      state.bookings.push(row);
      return row;
    }
  );
  state.businessHourFindFirst.mockImplementation(
    async (args: { where: { tenantId: string; dayOfWeek: number } }) =>
      state.businessHours.find(
        (row) => row.tenantId === args.where.tenantId && row.dayOfWeek === args.where.dayOfWeek
      ) ?? null
  );
  state.blackoutDateFindFirst.mockResolvedValue(null);
  state.tenantFindUnique.mockImplementation(
    async (args: { where: { slug: string }; select: { id: boolean } }) =>
      state.tenants.find((tenant) => tenant.slug === args.where.slug) ?? null
  );
});

describe("POST /api/public/bookings", () => {
  it("creates a pending-payment booking for the request tenant", async () => {
    const res = await POST(
      request("/api/public/bookings", {
        serviceId: "service-1",
        staffId: "staff-1",
        startsAt: "2026-07-27T10:00:00.000Z",
        name: "Ada Okafor",
        phone: "0803 123 4567",
        notes: "Window seat",
      })
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.booking).toMatchObject({
      id: "booking-1",
      tenantId: "tenant-1",
      clientId: "client-1",
      serviceId: "service-1",
      staffId: "staff-1",
      startsAt: "2026-07-27T10:00:00.000Z",
      endsAt: "2026-07-27T10:45:00.000Z",
      status: "pending_payment",
      notes: "Window seat",
    });
    expect(state.clientUpsert).toHaveBeenCalledWith({
      where: {
        tenantId_phone: {
          tenantId: "tenant-1",
          phone: "+2348031234567",
        },
      },
      create: {
        tenantId: "tenant-1",
        name: "Ada Okafor",
        phone: "+2348031234567",
      },
      update: {
        name: "Ada Okafor",
      },
    });
    expect(state.bookingCreate).toHaveBeenCalledWith({
      data: {
        tenantId: "tenant-1",
        clientId: "client-1",
        serviceId: "service-1",
        staffId: "staff-1",
        startsAt: new Date("2026-07-27T10:00:00.000Z"),
        endsAt: new Date("2026-07-27T10:45:00.000Z"),
        status: "pending_payment",
        notes: "Window seat",
      },
    });
  });

  it("rejects a slot already blocked by another pending-payment booking", async () => {
    state.bookings = [
      booking({
        startsAt: new Date("2026-07-27T10:15:00.000Z"),
        endsAt: new Date("2026-07-27T11:00:00.000Z"),
      }),
    ];

    const res = await POST(
      request("/api/public/bookings", {
        serviceId: "service-1",
        staffId: "staff-1",
        startsAt: "2026-07-27T10:00:00.000Z",
        name: "Ada Okafor",
        phone: "08031234567",
      })
    );

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("BOOKING_OVERLAP");
    expect(body.message).toContain("overlaps with another booking");
    expect(state.clientUpsert).not.toHaveBeenCalled();
    expect(state.bookingCreate).not.toHaveBeenCalled();
  });

  it("returns validation errors without trusting client-supplied server fields", async () => {
    const res = await POST(
      request("/api/public/bookings", {
        serviceId: "service-1",
        startsAt: "2026-07-27T10:00:00.000Z",
        name: "Ada Okafor",
        phone: "not-a-phone",
        status: "confirmed",
      })
    );

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("validation_failed");
    expect(body.fieldErrors.phone).toContain("Enter a valid Nigerian phone number");
    expect(body.formErrors).toContain("Unrecognized key(s) in object: 'status'");
    expect(state.bookingCreate).not.toHaveBeenCalled();
  });

  it("resolves tenant slugs before creating public bookings", async () => {
    state.services = [service({ tenantId: "tenant-from-slug" })];
    state.businessHours = [
      {
        id: "hours-2",
        tenantId: "tenant-from-slug",
        dayOfWeek: 1,
        opensAt: "09:00",
        closesAt: "17:00",
        isClosed: false,
      },
    ];

    const res = await POST(
      new NextRequest("http://demo.example.com/api/public/bookings", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          host: "demo.example.com",
        },
        body: JSON.stringify({
          serviceId: "service-1",
          startsAt: "2026-07-27T10:00:00.000Z",
          name: "Ada Okafor",
          phone: "08031234567",
        }),
      })
    );

    expect(res.status).toBe(201);
    expect(state.tenantFindUnique).toHaveBeenCalledWith({
      where: { slug: "demo" },
      select: { id: true },
    });
    expect(state.bookingCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: "tenant-from-slug",
        status: "pending_payment",
      }),
    });
  });
});
