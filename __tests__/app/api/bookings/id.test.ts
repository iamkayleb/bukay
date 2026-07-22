import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

type ServiceRow = {
  id: string;
  tenantId: string;
  name: string;
  durationMinutes: number;
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
  bookings: [] as BookingRow[],
  auditLogs: [] as AuditRow[],
  bookingUpdateError: null as null | Error,
  bookingFindFirst: vi.fn(),
  bookingFindMany: vi.fn(),
  bookingUpdate: vi.fn(),
  serviceFindFirst: vi.fn(),
  auditCreate: vi.fn(),
  tenantFindUnique: vi.fn(),
  getOpenWindows: vi.fn(),
}));

vi.mock("@/app/db/prisma", () => ({
  prisma: {
    service: { findFirst: state.serviceFindFirst },
    booking: {
      findFirst: state.bookingFindFirst,
      findMany: state.bookingFindMany,
      update: state.bookingUpdate,
    },
    auditLog: { create: state.auditCreate },
    tenant: { findUnique: state.tenantFindUnique },
  },
}));

vi.mock("@/app/lib/availability/open-windows", () => ({
  getOpenWindows: state.getOpenWindows,
}));

import { PATCH } from "@/app/api/bookings/[id]/route";

function jsonRequest(id: string, body: unknown, init: NextRequestInit = {}) {
  return new NextRequest(`http://app.test/api/bookings/${id}`, {
    method: "PATCH",
    ...init,
    headers: {
      "content-type": "application/json",
      "x-tenant-id": "tenant-1",
      ...(init.headers as Record<string, string> | undefined),
    },
    body: JSON.stringify(body),
  });
}

function fixedNow() {
  return new Date("2026-07-01T00:00:00.000Z");
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
      id: "svc-2",
      tenantId: "tenant-1",
      name: "Colour",
      durationMinutes: 60,
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
  state.bookings = [
    {
      id: "booking-1",
      tenantId: "tenant-1",
      clientId: "client-1",
      serviceId: "svc-1",
      staffId: "staff-1",
      startsAt: new Date("2026-07-15T10:00:00.000Z"),
      endsAt: new Date("2026-07-15T10:30:00.000Z"),
      status: "confirmed",
      notes: null,
      createdAt: fixedNow(),
      updatedAt: fixedNow(),
    },
    {
      id: "booking-2",
      tenantId: "tenant-1",
      clientId: "client-2",
      serviceId: "svc-1",
      staffId: "staff-1",
      startsAt: new Date("2026-07-15T11:00:00.000Z"),
      endsAt: new Date("2026-07-15T11:30:00.000Z"),
      status: "confirmed",
      notes: null,
      createdAt: fixedNow(),
      updatedAt: fixedNow(),
    },
  ];
  state.auditLogs = [];
  state.bookingUpdateError = null;

  state.bookingFindFirst.mockReset();
  state.bookingFindMany.mockReset();
  state.bookingUpdate.mockReset();
  state.serviceFindFirst.mockReset();
  state.auditCreate.mockReset();
  state.tenantFindUnique.mockReset();
  state.getOpenWindows.mockReset();

  state.bookingFindFirst.mockImplementation(
    async (args: { where: { tenantId: string; id: string } }) =>
      state.bookings.find(
        (b) => b.tenantId === args.where.tenantId && b.id === args.where.id,
      ) ?? null,
  );

  state.bookingFindMany.mockImplementation(
    async (args: {
      where: {
        tenantId: string;
        id?: { not: string };
        staffId: string | null;
        status?: { not: string };
        startsAt: { lt: Date };
        endsAt: { gt: Date };
      };
    }) => {
      const excludeId = args.where.id?.not;
      const endBound = args.where.startsAt.lt.getTime();
      const startBound = args.where.endsAt.gt.getTime();
      return state.bookings.filter((b) => {
        if (b.tenantId !== args.where.tenantId) return false;
        if (excludeId && b.id === excludeId) return false;
        if ((b.staffId ?? null) !== (args.where.staffId ?? null)) return false;
        if (args.where.status && b.status === args.where.status.not) return false;
        // Prisma overlap: b.startsAt < endsAt && b.endsAt > startsAt
        return b.startsAt.getTime() < endBound && b.endsAt.getTime() > startBound;
      });
    },
  );

  state.bookingUpdate.mockImplementation(
    async (args: { where: { id: string }; data: Partial<BookingRow> }) => {
      if (state.bookingUpdateError) throw state.bookingUpdateError;
      const idx = state.bookings.findIndex((b) => b.id === args.where.id);
      if (idx === -1) throw new Error("not found");
      const merged: BookingRow = {
        ...state.bookings[idx],
        ...args.data,
        updatedAt: fixedNow(),
      };
      state.bookings[idx] = merged;
      return merged;
    },
  );

  state.serviceFindFirst.mockImplementation(
    async (args: { where: { tenantId: string; id: string } }) =>
      state.services.find(
        (s) => s.tenantId === args.where.tenantId && s.id === args.where.id,
      ) ?? null,
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
        createdAt: fixedNow(),
      };
      state.auditLogs.push(row);
      return row;
    },
  );

  // Default: business hours accept everything.
  state.getOpenWindows.mockResolvedValue([
    {
      opensAt: new Date("2026-07-15T00:00:00.000Z"),
      closesAt: new Date("2026-07-15T23:59:00.000Z"),
    },
  ]);
});

describe("PATCH /api/bookings/[id]", () => {
  it("updates the start time and writes an audit log with old and new times", async () => {
    const res = await PATCH(
      jsonRequest("booking-1", { startsAt: "2026-07-15T14:00:00.000Z" }),
      { params: { id: "booking-1" } },
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.booking).toMatchObject({
      id: "booking-1",
      startsAt: "2026-07-15T14:00:00.000Z",
      endsAt: "2026-07-15T14:30:00.000Z",
    });

    expect(state.auditLogs).toHaveLength(1);
    const audit = state.auditLogs[0];
    expect(audit.action).toBe("booking_updated");
    expect(audit.entityType).toBe("Booking");
    expect(audit.entityId).toBe("booking-1");
    const meta = JSON.parse(audit.metadata as string);
    expect(meta.previous.startsAt).toBe("2026-07-15T10:00:00.000Z");
    expect(meta.previous.endsAt).toBe("2026-07-15T10:30:00.000Z");
    expect(meta.next.startsAt).toBe("2026-07-15T14:00:00.000Z");
    expect(meta.next.endsAt).toBe("2026-07-15T14:30:00.000Z");
    expect(meta.changes).toContain("startsAt");
    expect(meta.changes).toContain("endsAt");
  });

  it("returns 409 when the new time overlaps another booking on the same staff", async () => {
    const res = await PATCH(
      jsonRequest("booking-1", { startsAt: "2026-07-15T11:00:00.000Z" }),
      { params: { id: "booking-1" } },
    );

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("booking_conflict");
    expect(state.auditLogs).toHaveLength(0);
    // Underlying row untouched
    const original = state.bookings.find((b) => b.id === "booking-1");
    expect(original?.startsAt.toISOString()).toBe("2026-07-15T10:00:00.000Z");
  });

  it("returns 409 when the new time is outside business hours", async () => {
    state.getOpenWindows.mockResolvedValueOnce([
      {
        opensAt: new Date("2026-07-15T09:00:00.000Z"),
        closesAt: new Date("2026-07-15T17:00:00.000Z"),
      },
    ]);

    const res = await PATCH(
      jsonRequest("booking-1", { startsAt: "2026-07-15T22:00:00.000Z" }),
      { params: { id: "booking-1" } },
    );

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("outside_business_hours");
    expect(state.auditLogs).toHaveLength(0);
  });

  it("updates the notes without touching the time", async () => {
    const res = await PATCH(
      jsonRequest("booking-1", { notes: "Bring shampoo" }),
      { params: { id: "booking-1" } },
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.booking.notes).toBe("Bring shampoo");
    expect(state.auditLogs[0].action).toBe("booking_updated");
    const meta = JSON.parse(state.auditLogs[0].metadata as string);
    expect(meta.changes).toEqual(["notes"]);
  });

  it("updates status", async () => {
    const res = await PATCH(
      jsonRequest("booking-1", { status: "cancelled" }),
      { params: { id: "booking-1" } },
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.booking.status).toBe("cancelled");
  });

  it("changes service and recomputes endsAt from the new duration", async () => {
    const res = await PATCH(
      jsonRequest("booking-1", { serviceId: "svc-2" }),
      { params: { id: "booking-1" } },
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.booking.serviceId).toBe("svc-2");
    expect(body.booking.startsAt).toBe("2026-07-15T10:00:00.000Z");
    expect(body.booking.endsAt).toBe("2026-07-15T11:00:00.000Z");
  });

  it("returns 404 when booking is missing", async () => {
    const res = await PATCH(
      jsonRequest("booking-missing", { notes: "x" }),
      { params: { id: "booking-missing" } },
    );

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("booking_not_found");
  });

  it("returns 404 when service does not belong to the tenant", async () => {
    const res = await PATCH(
      jsonRequest("booking-1", { serviceId: "svc-missing" }),
      { params: { id: "booking-1" } },
    );

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("service_not_found");
  });

  it("returns 409 when the new service is inactive", async () => {
    const res = await PATCH(
      jsonRequest("booking-1", { serviceId: "svc-inactive" }),
      { params: { id: "booking-1" } },
    );

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("service_inactive");
  });

  it("rejects empty payloads", async () => {
    const res = await PATCH(
      jsonRequest("booking-1", {}),
      { params: { id: "booking-1" } },
    );

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("validation_failed");
  });

  it("rejects unknown fields", async () => {
    const res = await PATCH(
      jsonRequest("booking-1", { colour: "red" }),
      { params: { id: "booking-1" } },
    );

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("validation_failed");
  });

  it("uses x-user-id header as the audit actorId", async () => {
    const res = await PATCH(
      jsonRequest(
        "booking-1",
        { notes: "note" },
        { headers: { "x-user-id": "user-42" } },
      ),
      { params: { id: "booking-1" } },
    );

    expect(res.status).toBe(200);
    expect(state.auditLogs[0].actorId).toBe("user-42");
  });

  it("returns 400 when tenant cannot be resolved", async () => {
    const req = new NextRequest("http://app.test/api/bookings/booking-1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ notes: "x" }),
    });
    const res = await PATCH(req, { params: { id: "booking-1" } });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("tenant_required");
  });

  it("returns 409 when the DB exclusion constraint rejects the update", async () => {
    state.bookingUpdateError = Object.assign(
      new Error(
        'conflicting key value violates exclusion constraint "Booking_no_overlap_per_staff"',
      ),
      { code: "P2010" },
    );

    const res = await PATCH(
      jsonRequest("booking-1", { startsAt: "2026-07-15T14:00:00.000Z" }),
      { params: { id: "booking-1" } },
    );

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("booking_conflict");
    expect(state.auditLogs).toHaveLength(0);
  });
});
