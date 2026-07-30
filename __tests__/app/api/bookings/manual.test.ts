import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

type ServiceRow = {
  id: string;
  tenantId: string;
  name: string;
  durationMinutes: number;
  active: boolean;
};

type ClientRow = {
  id: string;
  tenantId: string;
  name: string;
  phone: string;
  email: string | null;
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
};

type AuditRow = {
  id: string;
  tenantId: string;
  actorId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: string | null;
  createdAt: Date;
};

type NextRequestInit = NonNullable<ConstructorParameters<typeof NextRequest>[1]>;

const state = vi.hoisted(() => ({
  services: [] as ServiceRow[],
  staff: [] as StaffRow[],
  clients: [] as ClientRow[],
  bookings: [] as BookingRow[],
  auditLogs: [] as AuditRow[],
  bookingCreateError: null as null | Error,
  serviceFindFirst: vi.fn(),
  staffFindFirst: vi.fn(),
  clientFindFirst: vi.fn(),
  clientCreate: vi.fn(),
  bookingCreate: vi.fn(),
  auditCreate: vi.fn(),
  tenantFindUnique: vi.fn(),
}));

vi.mock("@/app/db/prisma", () => ({
  prisma: {
    service: { findFirst: state.serviceFindFirst },
    staff: { findFirst: state.staffFindFirst },
    client: { findFirst: state.clientFindFirst, create: state.clientCreate },
    booking: { create: state.bookingCreate },
    auditLog: { create: state.auditCreate },
    tenant: { findUnique: state.tenantFindUnique },
  },
}));

import { POST } from "@/app/api/bookings/manual/route";

function jsonRequest(body: unknown, init: NextRequestInit = {}) {
  return new NextRequest("http://app.test/api/bookings/manual", {
    method: "POST",
    ...init,
    headers: {
      "content-type": "application/json",
      "x-tenant-id": "tenant-1",
      ...(init.headers as Record<string, string> | undefined),
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  state.services = [
    {
      id: "svc-1",
      tenantId: "tenant-1",
      name: "Haircut",
      durationMinutes: 30,
      active: true,
    },
    {
      id: "svc-inactive",
      tenantId: "tenant-1",
      name: "Retired",
      durationMinutes: 30,
      active: false,
    },
  ];
  state.staff = [
    { id: "staff-1", tenantId: "tenant-1", name: "Alice", active: true },
    { id: "staff-inactive", tenantId: "tenant-1", name: "Bob", active: false },
  ];
  state.clients = [
    {
      id: "client-1",
      tenantId: "tenant-1",
      name: "Existing",
      phone: "+2348000000001",
      email: null,
    },
  ];
  state.bookings = [];
  state.auditLogs = [];
  state.bookingCreateError = null;

  state.serviceFindFirst.mockReset();
  state.staffFindFirst.mockReset();
  state.clientFindFirst.mockReset();
  state.clientCreate.mockReset();
  state.bookingCreate.mockReset();
  state.auditCreate.mockReset();
  state.tenantFindUnique.mockReset();

  state.serviceFindFirst.mockImplementation(
    async (args: { where: { tenantId: string; id: string } }) =>
      state.services.find(
        (row) => row.tenantId === args.where.tenantId && row.id === args.where.id,
      ) ?? null,
  );
  state.staffFindFirst.mockImplementation(
    async (args: { where: { tenantId: string; id: string } }) =>
      state.staff.find(
        (row) => row.tenantId === args.where.tenantId && row.id === args.where.id,
      ) ?? null,
  );
  state.clientFindFirst.mockImplementation(
    async (args: { where: { tenantId: string; id?: string; phone?: string } }) =>
      state.clients.find((row) => {
        if (row.tenantId !== args.where.tenantId) return false;
        if (args.where.id && row.id !== args.where.id) return false;
        if (args.where.phone && row.phone !== args.where.phone) return false;
        return true;
      }) ?? null,
  );
  state.clientCreate.mockImplementation(
    async (args: {
      data: { tenantId: string; name: string; phone: string; email: string | null };
    }) => {
      if (
        state.clients.some(
          (row) => row.tenantId === args.data.tenantId && row.phone === args.data.phone,
        )
      ) {
        throw Object.assign(new Error("unique"), { code: "P2002" });
      }
      const row: ClientRow = {
        id: `client-${state.clients.length + 1}`,
        tenantId: args.data.tenantId,
        name: args.data.name,
        phone: args.data.phone,
        email: args.data.email,
      };
      state.clients.push(row);
      return row;
    },
  );
  state.bookingCreate.mockImplementation(
    async (args: {
      data: {
        tenantId: string;
        clientId: string;
        serviceId: string;
        staffId: string | null;
        startsAt: Date;
        endsAt: Date;
        status: string;
        notes: string | null;
      };
    }) => {
      if (state.bookingCreateError) {
        throw state.bookingCreateError;
      }
      const now = new Date("2026-07-01T00:00:00.000Z");
      const row: BookingRow = {
        id: `booking-${state.bookings.length + 1}`,
        ...args.data,
        createdAt: now,
        updatedAt: now,
      };
      state.bookings.push(row);
      return row;
    },
  );
  state.auditCreate.mockImplementation(
    async (args: {
      data: {
        tenantId: string;
        actorId: string | null;
        action: string;
        entityType: string;
        entityId: string | null;
        metadata: string | null;
      };
    }) => {
      const row: AuditRow = {
        id: `audit-${state.auditLogs.length + 1}`,
        ...args.data,
        createdAt: new Date("2026-07-01T00:00:00.000Z"),
      };
      state.auditLogs.push(row);
      return row;
    },
  );
});

describe("POST /api/bookings/manual", () => {
  it("creates a booking with an existing client and writes an audit log entry", async () => {
    const res = await POST(
      jsonRequest({
        clientId: "client-1",
        serviceId: "svc-1",
        staffId: "staff-1",
        startsAt: "2026-07-15T10:00:00.000Z",
        notes: "Regular",
      }),
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.booking).toMatchObject({
      tenantId: "tenant-1",
      clientId: "client-1",
      serviceId: "svc-1",
      staffId: "staff-1",
      status: "confirmed",
      notes: "Regular",
      startsAt: "2026-07-15T10:00:00.000Z",
      endsAt: "2026-07-15T10:30:00.000Z",
    });
    expect(body.client).toMatchObject({ id: "client-1", created: false });

    expect(state.bookings).toHaveLength(1);
    expect(state.auditLogs).toHaveLength(1);
    expect(state.auditLogs[0]).toMatchObject({
      tenantId: "tenant-1",
      action: "manual_booking_created",
      entityType: "Booking",
      entityId: state.bookings[0].id,
    });
    expect(JSON.parse(state.auditLogs[0].metadata as string)).toMatchObject({
      clientId: "client-1",
      clientCreated: false,
      serviceId: "svc-1",
      staffId: "staff-1",
    });
  });

  it("creates a new client inline when newClient is provided", async () => {
    const res = await POST(
      jsonRequest({
        newClient: {
          name: "Ada",
          phone: "+2348000000099",
          email: "ada@example.com",
        },
        serviceId: "svc-1",
        staffId: "staff-1",
        startsAt: "2026-07-15T12:00:00.000Z",
      }),
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.client).toMatchObject({
      name: "Ada",
      phone: "+2348000000099",
      email: "ada@example.com",
      created: true,
    });
    expect(state.clients.some((c) => c.phone === "+2348000000099")).toBe(true);
    expect(state.bookings).toHaveLength(1);
    const audit = state.auditLogs[0];
    expect(JSON.parse(audit.metadata as string)).toMatchObject({ clientCreated: true });
  });

  it("reuses an existing client when newClient phone matches a tenant client", async () => {
    const res = await POST(
      jsonRequest({
        newClient: {
          name: "Ignored",
          phone: "+2348000000001",
        },
        serviceId: "svc-1",
        staffId: "staff-1",
        startsAt: "2026-07-16T09:00:00.000Z",
      }),
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.client).toMatchObject({ id: "client-1", created: false });
    expect(state.clients).toHaveLength(1);
  });

  it("uses x-user-id header as the audit actorId", async () => {
    const res = await POST(
      jsonRequest(
        {
          clientId: "client-1",
          serviceId: "svc-1",
          staffId: "staff-1",
          startsAt: "2026-07-15T10:00:00.000Z",
        },
        { headers: { "x-user-id": "user-42" } },
      ),
    );

    expect(res.status).toBe(201);
    expect(state.auditLogs[0].actorId).toBe("user-42");
  });

  it("rejects payloads that provide both clientId and newClient", async () => {
    const res = await POST(
      jsonRequest({
        clientId: "client-1",
        newClient: { name: "N", phone: "+1234567890" },
        serviceId: "svc-1",
        startsAt: "2026-07-15T10:00:00.000Z",
      }),
    );

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("validation_failed");
    expect(state.bookingCreate).not.toHaveBeenCalled();
  });

  it("rejects payloads that provide neither clientId nor newClient", async () => {
    const res = await POST(
      jsonRequest({
        serviceId: "svc-1",
        startsAt: "2026-07-15T10:00:00.000Z",
      }),
    );

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("validation_failed");
  });

  it("returns 404 when the referenced service is not in the tenant", async () => {
    const res = await POST(
      jsonRequest({
        clientId: "client-1",
        serviceId: "svc-does-not-exist",
        startsAt: "2026-07-15T10:00:00.000Z",
      }),
    );

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("service_not_found");
    expect(state.bookingCreate).not.toHaveBeenCalled();
  });

  it("returns 409 when the referenced service is inactive", async () => {
    const res = await POST(
      jsonRequest({
        clientId: "client-1",
        serviceId: "svc-inactive",
        startsAt: "2026-07-15T10:00:00.000Z",
      }),
    );

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("service_inactive");
  });

  it("returns 404 when staffId does not belong to the tenant", async () => {
    const res = await POST(
      jsonRequest({
        clientId: "client-1",
        serviceId: "svc-1",
        staffId: "staff-missing",
        startsAt: "2026-07-15T10:00:00.000Z",
      }),
    );

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("staff_not_found");
  });

  it("returns 404 when clientId does not belong to the tenant", async () => {
    const res = await POST(
      jsonRequest({
        clientId: "client-other-tenant",
        serviceId: "svc-1",
        startsAt: "2026-07-15T10:00:00.000Z",
      }),
    );

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("client_not_found");
  });

  it("returns 409 when the DB exclusion constraint rejects an overlap", async () => {
    state.bookingCreateError = Object.assign(
      new Error(
        'conflicting key value violates exclusion constraint "Booking_no_overlap_per_staff"',
      ),
      { code: "P2010" },
    );

    const res = await POST(
      jsonRequest({
        clientId: "client-1",
        serviceId: "svc-1",
        staffId: "staff-1",
        startsAt: "2026-07-15T10:00:00.000Z",
      }),
    );

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("booking_conflict");
    expect(state.auditLogs).toHaveLength(0);
  });

  it("returns 400 for invalid JSON body", async () => {
    const req = new NextRequest("http://app.test/api/bookings/manual", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-tenant-id": "tenant-1",
      },
      body: "{",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_json");
  });

  it("returns 400 when tenant cannot be resolved", async () => {
    const req = new NextRequest("http://app.test/api/bookings/manual", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        clientId: "client-1",
        serviceId: "svc-1",
        startsAt: "2026-07-15T10:00:00.000Z",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("tenant_required");
  });
});
