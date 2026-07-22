import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

type ClientRow = {
  id: string;
  tenantId: string;
  name: string;
  phone: string;
  email: string | null;
};

type ServiceRow = {
  id: string;
  tenantId: string;
  name: string;
  durationMinutes: number;
  active: boolean;
};

type StaffRow = {
  id: string;
  tenantId: string;
  name: string;
  active: boolean;
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
  client?: ClientRow;
  service?: ServiceRow;
  staff?: StaffRow | null;
};

type NextRequestInit = NonNullable<ConstructorParameters<typeof NextRequest>[1]>;

const state = vi.hoisted(() => ({
  clients: [] as ClientRow[],
  services: [] as ServiceRow[],
  staff: [] as StaffRow[],
  bookings: [] as BookingRow[],
  auditLogs: [] as unknown[],
  clientFindFirst: vi.fn(),
  clientCreate: vi.fn(),
  serviceFindFirst: vi.fn(),
  staffFindFirst: vi.fn(),
  bookingCreate: vi.fn(),
  auditLogCreate: vi.fn(),
  transaction: vi.fn(),
  tenantFindUnique: vi.fn(),
}));

vi.mock("@/app/db/prisma", () => ({
  prisma: {
    client: {
      findFirst: state.clientFindFirst,
      create: state.clientCreate,
    },
    service: {
      findFirst: state.serviceFindFirst,
    },
    staff: {
      findFirst: state.staffFindFirst,
    },
    booking: {
      create: state.bookingCreate,
    },
    auditLog: {
      create: state.auditLogCreate,
    },
    tenant: {
      findUnique: state.tenantFindUnique,
    },
    $transaction: state.transaction,
  },
}));

import { POST } from "@/app/api/bookings/manual/route";

function request(path: string, init: NextRequestInit = {}) {
  return new NextRequest(`http://app.test${path}`, {
    ...init,
    method: init.method ?? "POST",
    headers: {
      "content-type": "application/json",
      "x-tenant-id": "tenant-1",
      ...(init.headers as Record<string, string> | undefined),
    },
  });
}

function jsonRequest(body: unknown, init: NextRequestInit = {}) {
  return request("/api/bookings/manual", {
    ...init,
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  state.clients = [
    {
      id: "client-1",
      tenantId: "tenant-1",
      name: "Ada Okafor",
      phone: "+2348011111111",
      email: "ada@example.com",
    },
  ];
  state.services = [
    {
      id: "service-1",
      tenantId: "tenant-1",
      name: "Haircut",
      durationMinutes: 45,
      active: true,
    },
  ];
  state.staff = [{ id: "staff-1", tenantId: "tenant-1", name: "Owner", active: true }];
  state.bookings = [];
  state.auditLogs = [];

  state.clientFindFirst.mockReset();
  state.clientCreate.mockReset();
  state.serviceFindFirst.mockReset();
  state.staffFindFirst.mockReset();
  state.bookingCreate.mockReset();
  state.auditLogCreate.mockReset();
  state.transaction.mockReset();
  state.tenantFindUnique.mockReset();

  state.transaction.mockImplementation(async (callback) =>
    callback({
      client: { findFirst: state.clientFindFirst, create: state.clientCreate },
      service: { findFirst: state.serviceFindFirst },
      staff: { findFirst: state.staffFindFirst },
      booking: { create: state.bookingCreate },
      auditLog: { create: state.auditLogCreate },
    })
  );
  state.clientFindFirst.mockImplementation(
    async (args: { where: { tenantId: string; id?: string; phone?: string } }) =>
      state.clients.find(
        (client) =>
          client.tenantId === args.where.tenantId &&
          (args.where.id ? client.id === args.where.id : client.phone === args.where.phone)
      ) ?? null
  );
  state.clientCreate.mockImplementation(async (args: { data: Omit<ClientRow, "id"> }) => {
    if (
      state.clients.some(
        (client) => client.tenantId === args.data.tenantId && client.phone === args.data.phone
      )
    ) {
      throw Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
    }

    const client = { id: `client-${state.clients.length + 1}`, ...args.data };
    state.clients.push(client);
    return client;
  });
  state.serviceFindFirst.mockImplementation(
    async (args: { where: { tenantId: string; id: string; active: boolean } }) =>
      state.services.find(
        (service) =>
          service.tenantId === args.where.tenantId &&
          service.id === args.where.id &&
          service.active === args.where.active
      ) ?? null
  );
  state.staffFindFirst.mockImplementation(
    async (args: { where: { tenantId: string; id?: string; active: boolean } }) =>
      state.staff.find(
        (staff) =>
          staff.tenantId === args.where.tenantId &&
          staff.active === args.where.active &&
          (!args.where.id || staff.id === args.where.id)
      ) ?? null
  );
  state.bookingCreate.mockImplementation(
    async (args: { data: Omit<BookingRow, "id" | "createdAt" | "updatedAt"> }) => {
      const booking = {
        id: `booking-${state.bookings.length + 1}`,
        ...args.data,
        createdAt: new Date("2026-07-22T09:00:00.000Z"),
        updatedAt: new Date("2026-07-22T09:00:00.000Z"),
        client: state.clients.find((client) => client.id === args.data.clientId),
        service: state.services.find((service) => service.id === args.data.serviceId),
        staff: state.staff.find((staff) => staff.id === args.data.staffId) ?? null,
      };
      state.bookings.push(booking);
      return booking;
    }
  );
  state.auditLogCreate.mockImplementation(async (args: unknown) => {
    state.auditLogs.push(args);
    return { id: `audit-${state.auditLogs.length}` };
  });
});

describe("POST /api/bookings/manual", () => {
  it("creates a confirmed booking for an existing client and writes an audit log", async () => {
    const res = await POST(
      jsonRequest({
        client: { id: "client-1" },
        serviceId: "service-1",
        startsAt: "2026-07-23T10:00:00.000Z",
        notes: " Window seat ",
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
      startsAt: "2026-07-23T10:00:00.000Z",
      endsAt: "2026-07-23T10:45:00.000Z",
      status: "confirmed",
      notes: "Window seat",
    });
    expect(state.bookingCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: "tenant-1",
          staffId: "staff-1",
          status: "confirmed",
        }),
      })
    );
    expect(state.auditLogCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: "tenant-1",
        action: "manual_booking_created",
        entityType: "Booking",
        entityId: "booking-1",
      }),
    });
  });

  it("creates an inline client before creating the booking", async () => {
    const res = await POST(
      jsonRequest({
        client: {
          name: "Bola Mensah",
          phone: "+2348022222222",
          email: "",
        },
        serviceId: "service-1",
        staffId: "staff-1",
        startsAt: "2026-07-23T12:00:00.000Z",
      })
    );

    expect(res.status).toBe(201);
    expect(state.clientCreate).toHaveBeenCalledWith({
      data: {
        tenantId: "tenant-1",
        name: "Bola Mensah",
        phone: "+2348022222222",
        email: null,
      },
    });
    expect(state.bookings[0].clientId).toBe("client-2");
  });

  it("rejects invalid payloads before writing", async () => {
    const res = await POST(
      jsonRequest({
        client: { id: "" },
        serviceId: "",
        startsAt: "not-a-date",
      })
    );

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("validation_failed");
    expect(state.bookingCreate).not.toHaveBeenCalled();
  });

  it("returns not found when the selected service, staff, or client is outside the tenant", async () => {
    const res = await POST(
      jsonRequest({
        client: { id: "missing-client" },
        serviceId: "service-1",
        staffId: "staff-1",
        startsAt: "2026-07-23T12:00:00.000Z",
      })
    );

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toMatchObject({
      ok: false,
      error: "booking_dependency_not_found",
    });
  });

  it("maps database overlap constraint failures to a conflict", async () => {
    state.bookingCreate.mockRejectedValueOnce(
      Object.assign(new Error("exclusion constraint Booking_staffId_time_overlap_excl failed"), {
        code: "P2004",
        meta: { database_error: "SQLSTATE 23P01" },
      })
    );

    const res = await POST(
      jsonRequest({
        client: { id: "client-1" },
        serviceId: "service-1",
        staffId: "staff-1",
        startsAt: "2026-07-23T10:00:00.000Z",
      })
    );

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({ ok: false, error: "booking_overlap" });
    expect(state.auditLogCreate).not.toHaveBeenCalled();
  });
});
