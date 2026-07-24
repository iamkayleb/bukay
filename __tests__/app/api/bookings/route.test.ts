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
  client?: { name: string };
  service?: { name: string };
  staff?: { name: string } | null;
};

type NextRequestInit = NonNullable<ConstructorParameters<typeof NextRequest>[1]>;

const state = vi.hoisted(() => ({
  bookings: [] as BookingRow[],
  auditLogs: [] as unknown[],
  serviceFindFirst: vi.fn(),
  bookingFindFirst: vi.fn(),
  bookingUpdate: vi.fn(),
  auditLogCreate: vi.fn(),
  transaction: vi.fn(),
  tenantFindUnique: vi.fn(),
}));

vi.mock("@/app/db/prisma", () => ({
  prisma: {
    booking: {
      findFirst: state.bookingFindFirst,
      update: state.bookingUpdate,
    },
    service: {
      findFirst: state.serviceFindFirst,
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

import { PATCH } from "@/app/api/bookings/[id]/route";

function request(path: string, init: NextRequestInit = {}) {
  return new NextRequest(`http://app.test${path}`, {
    ...init,
    method: init.method ?? "PATCH",
    headers: {
      "content-type": "application/json",
      "x-tenant-id": "tenant-1",
      ...(init.headers as Record<string, string> | undefined),
    },
  });
}

function jsonRequest(path: string, body: unknown, init: NextRequestInit = {}) {
  return request(path, {
    ...init,
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  state.bookings = [
    {
      id: "booking-1",
      tenantId: "tenant-1",
      clientId: "client-1",
      serviceId: "service-1",
      staffId: "staff-1",
      startsAt: new Date("2026-07-22T10:00:00.000Z"),
      endsAt: new Date("2026-07-22T10:45:00.000Z"),
      status: "confirmed",
      notes: "Prefers mornings",
      createdAt: new Date("2026-07-20T09:00:00.000Z"),
      updatedAt: new Date("2026-07-20T09:00:00.000Z"),
      client: { name: "Ada Okafor" },
      service: { name: "Haircut" },
      staff: { name: "Owner" },
    },
  ];
  state.auditLogs = [];

  state.bookingFindFirst.mockReset();
  state.bookingUpdate.mockReset();
  state.serviceFindFirst.mockReset();
  state.auditLogCreate.mockReset();
  state.transaction.mockReset();
  state.tenantFindUnique.mockReset();

  state.transaction.mockImplementation(async (callback) =>
    callback({
      service: { findFirst: state.serviceFindFirst },
      booking: { findFirst: state.bookingFindFirst, update: state.bookingUpdate },
      auditLog: { create: state.auditLogCreate },
    })
  );
  state.bookingFindFirst.mockImplementation(
    async (args: { where: { tenantId: string; id: string } }) =>
      state.bookings.find(
        (booking) => booking.tenantId === args.where.tenantId && booking.id === args.where.id
      ) ?? null
  );
  state.bookingUpdate.mockImplementation(
    async (args: { where: { id: string }; data: Partial<BookingRow> }) => {
      const index = state.bookings.findIndex((booking) => booking.id === args.where.id);
      if (index === -1) {
        throw Object.assign(new Error("Record not found"), { code: "P2025" });
      }

      state.bookings[index] = {
        ...state.bookings[index],
        ...args.data,
        service:
          args.data.serviceId === "service-2"
            ? { name: "Beard Trim" }
            : state.bookings[index].service,
        updatedAt: new Date("2026-07-22T12:00:00.000Z"),
      };
      return state.bookings[index];
    }
  );
  state.serviceFindFirst.mockImplementation(
    async (args: { where: { tenantId: string; id: string; active: boolean } }) => {
      if (args.where.tenantId !== "tenant-1" || !args.where.active) {
        return null;
      }

      return ["service-1", "service-2"].includes(args.where.id) ? { id: args.where.id } : null;
    }
  );
  state.auditLogCreate.mockImplementation(async (args: unknown) => {
    state.auditLogs.push(args);
    return { id: `audit-${state.auditLogs.length}` };
  });
});

describe("PATCH /api/bookings/:id", () => {
  it("reschedules a booking and writes old and new times to the audit log", async () => {
    const res = await PATCH(
      jsonRequest("/api/bookings/booking-1", {
        startsAt: "2026-07-23T14:00:00.000Z",
        endsAt: "2026-07-23T14:45:00.000Z",
      }),
      { params: { id: "booking-1" } }
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.booking).toMatchObject({
      id: "booking-1",
      startsAt: "2026-07-23T14:00:00.000Z",
      endsAt: "2026-07-23T14:45:00.000Z",
    });
    expect(state.bookingUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "booking-1" },
        data: {
          startsAt: new Date("2026-07-23T14:00:00.000Z"),
          endsAt: new Date("2026-07-23T14:45:00.000Z"),
        },
      })
    );
    expect(state.auditLogCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: "tenant-1",
        action: "booking_rescheduled",
        entityType: "Booking",
        entityId: "booking-1",
      }),
    });

    const auditArgs = state.auditLogs[0] as { data: { metadata: string } };
    expect(JSON.parse(auditArgs.data.metadata)).toEqual({
      oldStartsAt: "2026-07-22T10:00:00.000Z",
      oldEndsAt: "2026-07-22T10:45:00.000Z",
      newStartsAt: "2026-07-23T14:00:00.000Z",
      newEndsAt: "2026-07-23T14:45:00.000Z",
      oldServiceId: "service-1",
      newServiceId: "service-1",
      oldStatus: "confirmed",
      newStatus: "confirmed",
      oldNotes: "Prefers mornings",
      newNotes: "Prefers mornings",
    });
  });

  it("updates service, time, notes, and status for the edit modal", async () => {
    const res = await PATCH(
      jsonRequest("/api/bookings/booking-1", {
        serviceId: "service-2",
        startsAt: "2026-07-23T11:00:00.000Z",
        endsAt: "2026-07-23T11:20:00.000Z",
        notes: "Bring reference photo",
        status: "completed",
      }),
      { params: { id: "booking-1" } }
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.booking).toMatchObject({
      id: "booking-1",
      serviceId: "service-2",
      startsAt: "2026-07-23T11:00:00.000Z",
      endsAt: "2026-07-23T11:20:00.000Z",
      notes: "Bring reference photo",
      status: "completed",
      service: { name: "Beard Trim" },
    });
    expect(state.serviceFindFirst).toHaveBeenCalledWith({
      where: { tenantId: "tenant-1", id: "service-2", active: true },
      select: { id: true },
    });
    expect(state.bookingUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "booking-1" },
        data: {
          serviceId: "service-2",
          startsAt: new Date("2026-07-23T11:00:00.000Z"),
          endsAt: new Date("2026-07-23T11:20:00.000Z"),
          notes: "Bring reference photo",
          status: "completed",
        },
      })
    );
  });

  it("returns not found when the edited service is outside the tenant", async () => {
    const res = await PATCH(
      jsonRequest("/api/bookings/booking-1", {
        serviceId: "missing-service",
        startsAt: "2026-07-23T11:00:00.000Z",
        endsAt: "2026-07-23T11:20:00.000Z",
        notes: null,
        status: "confirmed",
      }),
      { params: { id: "booking-1" } }
    );

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({
      ok: false,
      error: "booking_dependency_not_found",
    });
    expect(state.bookingUpdate).not.toHaveBeenCalled();
    expect(state.auditLogCreate).not.toHaveBeenCalled();
  });

  it("uses a booking update audit action when the time does not change", async () => {
    const res = await PATCH(
      jsonRequest("/api/bookings/booking-1", {
        notes: "Updated notes",
        status: "pending",
      }),
      { params: { id: "booking-1" } }
    );

    expect(res.status).toBe(200);
    expect(state.bookingUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          notes: "Updated notes",
          status: "pending",
        },
      })
    );
    expect(state.auditLogCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "booking_updated",
        entityId: "booking-1",
      }),
    });
  });

  it("rejects invalid reschedule times before writing", async () => {
    const res = await PATCH(
      jsonRequest("/api/bookings/booking-1", {
        startsAt: "2026-07-23T14:00:00.000Z",
        endsAt: "2026-07-23T13:45:00.000Z",
      }),
      { params: { id: "booking-1" } }
    );

    expect(res.status).toBe(422);
    expect(state.bookingUpdate).not.toHaveBeenCalled();
    expect(state.auditLogCreate).not.toHaveBeenCalled();
  });

  it("returns not found when the booking is outside the tenant", async () => {
    const res = await PATCH(
      jsonRequest("/api/bookings/missing", {
        startsAt: "2026-07-23T14:00:00.000Z",
        endsAt: "2026-07-23T14:45:00.000Z",
      }),
      { params: { id: "missing" } }
    );

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ ok: false, error: "booking_not_found" });
  });

  it("maps database overlap constraint failures to a conflict", async () => {
    state.bookingUpdate.mockRejectedValueOnce(
      Object.assign(new Error("exclusion constraint Booking_staffId_time_overlap_excl failed"), {
        code: "P2004",
        meta: { database_error: "SQLSTATE 23P01" },
      })
    );

    const res = await PATCH(
      jsonRequest("/api/bookings/booking-1", {
        startsAt: "2026-07-23T14:00:00.000Z",
        endsAt: "2026-07-23T14:45:00.000Z",
      }),
      { params: { id: "booking-1" } }
    );

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({ ok: false, error: "booking_overlap" });
    expect(state.auditLogCreate).not.toHaveBeenCalled();
  });
});
