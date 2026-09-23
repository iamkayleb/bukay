import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { __resetDomainEventsForTests, onBookingConfirmed } from "@/app/lib/events";
import {
  __resetNotificationSubscribersForTests,
  onLifecycleEvent,
  registerNotificationSubscribers,
} from "@/app/lib/notifications/subscribers";
import { FakeWhatsAppProvider } from "@/app/lib/whatsapp/fake";
import { MemorySmsProvider } from "@/app/lib/sms/memory";

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
  bookings: [] as BookingRow[],
  businessHours: [] as BusinessHourRow[],
  findBookingFirst: vi.fn(),
  findBookingMany: vi.fn(),
  updateBooking: vi.fn(),
  findBusinessHourFirst: vi.fn(),
  findBlackoutDateFirst: vi.fn(),
  tenantFindUnique: vi.fn(),
  clientFindFirst: vi.fn(),
  serviceFindFirst: vi.fn(),
}));

vi.mock("@/app/db/prisma", () => ({
  prisma: {
    booking: {
      findFirst: state.findBookingFirst,
      findMany: state.findBookingMany,
      update: state.updateBooking,
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
    client: {
      findFirst: state.clientFindFirst,
    },
    service: {
      findFirst: state.serviceFindFirst,
    },
  },
}));

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
  state.updateBooking.mockReset();
  state.findBusinessHourFirst.mockReset();
  state.findBlackoutDateFirst.mockReset();
  state.tenantFindUnique.mockReset();
  state.clientFindFirst.mockReset();
  state.serviceFindFirst.mockReset();

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
  state.findBlackoutDateFirst.mockResolvedValue(null);
  state.clientFindFirst.mockResolvedValue({
    name: "Ada Lovelace",
    phone: "+2348012345678",
  });
  state.serviceFindFirst.mockResolvedValue({ name: "Classic Haircut" });
  state.tenantFindUnique.mockResolvedValue({ name: "Bukay Demo Salon" });
});

afterEach(() => {
  __resetDomainEventsForTests();
  __resetNotificationSubscribersForTests();
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

  it("emits booking.confirmed when a pending booking is confirmed", async () => {
    state.bookings = [booking({ status: "pending" })];
    const handler = vi.fn();
    onBookingConfirmed(handler);

    const res = await PATCH(request("/api/bookings/booking-1", { status: "confirmed" }), {
      params: { id: "booking-1" },
    });

    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({
      bookingId: "booking-1",
      tenantId: "tenant-1",
      staffId: "staff-1",
      startsAt: new Date("2026-07-27T10:00:00.000Z"),
      endsAt: new Date("2026-07-27T11:00:00.000Z"),
    });
  });

  it("does not re-emit booking.confirmed when a booking is already confirmed", async () => {
    state.bookings = [booking({ status: "confirmed" })];
    const handler = vi.fn();
    onBookingConfirmed(handler);

    const res = await PATCH(request("/api/bookings/booking-1", { status: "confirmed" }), {
      params: { id: "booking-1" },
    });

    expect(res.status).toBe(200);
    expect(handler).not.toHaveBeenCalled();
  });

  it("emits a lifecycle notification when a pending booking is confirmed", async () => {
    state.bookings = [booking({ status: "pending" })];
    const lifecycle = vi.fn();
    onLifecycleEvent(lifecycle);

    const res = await PATCH(request("/api/bookings/booking-1", { status: "confirmed" }), {
      params: { id: "booking-1" },
    });

    expect(res.status).toBe(200);
    expect(lifecycle).toHaveBeenCalledTimes(1);
    expect(lifecycle).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "booking.confirmed",
        bookingId: "booking-1",
        tenantId: "tenant-1",
        to: "+2348012345678",
      })
    );
  });

  it("emits a lifecycle notification when a booking is cancelled", async () => {
    state.bookings = [booking({ status: "confirmed" })];
    const lifecycle = vi.fn();
    onLifecycleEvent(lifecycle);

    const res = await PATCH(request("/api/bookings/booking-1", { status: "cancelled" }), {
      params: { id: "booking-1" },
    });

    expect(res.status).toBe(200);
    expect(lifecycle).toHaveBeenCalledTimes(1);
    expect(lifecycle).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "booking.cancelled",
        bookingId: "booking-1",
      })
    );
  });

  it("emits a lifecycle notification when a booking is rescheduled", async () => {
    state.bookings = [booking({ status: "confirmed" })];
    const lifecycle = vi.fn();
    onLifecycleEvent(lifecycle);

    const res = await PATCH(
      request("/api/bookings/booking-1", {
        startsAt: "2026-07-27T11:00:00.000Z",
        endsAt: "2026-07-27T12:00:00.000Z",
      }),
      { params: { id: "booking-1" } }
    );

    expect(res.status).toBe(200);
    expect(lifecycle).toHaveBeenCalledTimes(1);
    expect(lifecycle).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "booking.rescheduled",
        bookingId: "booking-1",
        startsAt: "2026-07-27T11:00:00.000Z",
        previousStartsAt: "2026-07-27T10:00:00.000Z",
      })
    );
  });

  it("falls back to SMS when WhatsApp fails for a booking confirm notification", async () => {
    state.bookings = [booking({ status: "pending" })];
    const whatsapp = new FakeWhatsAppProvider();
    whatsapp.failAlways = new Error("whatsapp unavailable");
    const sms = new MemorySmsProvider();
    const deadLetters: Array<Record<string, unknown>> = [];
    const onResult = vi.fn();

    registerNotificationSubscribers({
      whatsapp,
      sms,
      db: {
        deadLetter: {
          async create({ data }) {
            deadLetters.push({ ...data });
            return data;
          },
        },
      },
      backoff: { maxAttempts: 1, baseDelayMs: 0, sleep: async () => undefined },
      onResult,
    });

    const res = await PATCH(request("/api/bookings/booking-1", { status: "confirmed" }), {
      params: { id: "booking-1" },
    });

    expect(res.status).toBe(200);
    await vi.waitFor(() => expect(onResult).toHaveBeenCalled());
    expect(onResult.mock.calls[0][0]).toMatchObject({
      type: "booking.confirmed",
      bookingId: "booking-1",
    });
    expect(onResult.mock.calls[0][1]).toMatchObject({ status: "sent", channel: "sms" });
    expect(whatsapp.outbox).toHaveLength(0);
    expect(sms.outbox).toHaveLength(1);
    expect(sms.outbox[0].to).toBe("+2348012345678");
    expect(sms.outbox[0].body).toContain("Ada Lovelace");
    expect(deadLetters).toHaveLength(0);
  });

  it("does not attempt SMS when WhatsApp succeeds for a booking cancel notification", async () => {
    state.bookings = [booking({ status: "confirmed" })];
    const whatsapp = new FakeWhatsAppProvider();
    const sms = new MemorySmsProvider();
    const onResult = vi.fn();

    registerNotificationSubscribers({
      whatsapp,
      sms,
      db: {
        deadLetter: {
          async create() {
            throw new Error("DeadLetter should not be written on success");
          },
        },
      },
      backoff: { maxAttempts: 1, baseDelayMs: 0, sleep: async () => undefined },
      onResult,
    });

    const res = await PATCH(request("/api/bookings/booking-1", { status: "cancelled" }), {
      params: { id: "booking-1" },
    });

    expect(res.status).toBe(200);
    await vi.waitFor(() => expect(onResult).toHaveBeenCalled());
    expect(onResult.mock.calls[0][1]).toMatchObject({ status: "sent", channel: "whatsapp" });
    expect(whatsapp.outbox).toHaveLength(1);
    expect(sms.outbox).toHaveLength(0);
  });
});
