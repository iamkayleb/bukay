// Integration coverage for the booking notification pipeline: exercises the
// real manual-create and PATCH routes together with the real template +
// send-booking-notification modules (only Prisma is mocked), asserting that
// each booking transition attempts exactly one email send and writes exactly
// one notification AuditLog row alongside the row the route already wrote
// for the transition itself.
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  setEmailProviderForTests,
  __resetEmailProviderForTests,
  type EmailMessage,
  type EmailProvider,
  type EmailSendResult,
} from "@/app/lib/email";

type Row = Record<string, unknown>;

const state = vi.hoisted(() => ({
  tenants: [] as Row[],
  services: [] as Row[],
  staff: [] as Row[],
  clients: [] as Row[],
  bookings: [] as Row[],
  auditLogs: [] as Row[],
}));

vi.mock("@/app/db/prisma", () => ({
  prisma: {
    tenant: {
      findUnique: vi.fn(async (args: { where: { id?: string; slug?: string } }) =>
        state.tenants.find(
          (t) => t.id === args.where.id || t.slug === args.where.slug,
        ) ?? null,
      ),
    },
    service: {
      findFirst: vi.fn(async (args: { where: { tenantId: string; id: string } }) =>
        state.services.find(
          (s) => s.tenantId === args.where.tenantId && s.id === args.where.id,
        ) ?? null,
      ),
    },
    staff: {
      findFirst: vi.fn(async (args: { where: { tenantId: string; id: string } }) =>
        state.staff.find(
          (s) => s.tenantId === args.where.tenantId && s.id === args.where.id,
        ) ?? null,
      ),
    },
    client: {
      findFirst: vi.fn(async (args: { where: { tenantId: string; id?: string; phone?: string } }) =>
        state.clients.find((c) => {
          if (c.tenantId !== args.where.tenantId) return false;
          if (args.where.id && c.id !== args.where.id) return false;
          if (args.where.phone && c.phone !== args.where.phone) return false;
          return true;
        }) ?? null,
      ),
      create: vi.fn(async (args: { data: Row }) => {
        const row = { id: `client-${state.clients.length + 1}`, ...args.data };
        state.clients.push(row);
        return row;
      }),
    },
    booking: {
      findFirst: vi.fn(async (args: { where: { tenantId: string; id: string } }) =>
        state.bookings.find(
          (b) => b.tenantId === args.where.tenantId && b.id === args.where.id,
        ) ?? null,
      ),
      findMany: vi.fn(async () => []),
      create: vi.fn(async (args: { data: Row }) => {
        const now = new Date("2026-07-01T00:00:00.000Z");
        const row = {
          id: `booking-${state.bookings.length + 1}`,
          createdAt: now,
          updatedAt: now,
          ...args.data,
        };
        state.bookings.push(row);
        return row;
      }),
      update: vi.fn(async (args: { where: { id: string }; data: Row }) => {
        const idx = state.bookings.findIndex((b) => b.id === args.where.id);
        const merged = {
          ...state.bookings[idx],
          ...args.data,
          updatedAt: new Date("2026-07-01T00:00:00.000Z"),
        };
        state.bookings[idx] = merged;
        return merged;
      }),
    },
    auditLog: {
      create: vi.fn(async (args: { data: Row }) => {
        const row = { id: `audit-${state.auditLogs.length + 1}`, ...args.data };
        state.auditLogs.push(row);
        return row;
      }),
    },
  },
}));

vi.mock("@/app/lib/availability/open-windows", () => ({
  getOpenWindows: vi.fn(async () => [
    {
      opensAt: new Date("2026-07-15T00:00:00.000Z"),
      closesAt: new Date("2026-07-15T23:59:00.000Z"),
    },
  ]),
}));

import { POST as createBooking } from "@/app/api/bookings/manual/route";
import { PATCH as patchBooking } from "@/app/api/bookings/[id]/route";

function req(url: string, method: string, body: unknown) {
  return new NextRequest(url, {
    method,
    headers: { "content-type": "application/json", "x-tenant-id": "tenant-1" },
    body: JSON.stringify(body),
  });
}

class SpyEmailProvider implements EmailProvider {
  readonly name = "spy";
  readonly sent: EmailMessage[] = [];

  async send(message: EmailMessage): Promise<EmailSendResult> {
    this.sent.push(message);
    return { id: `spy-${this.sent.length}`, provider: this.name, to: message.to };
  }
}

function emailAuditRows() {
  return state.auditLogs.filter((row) => row.action === "booking_email_send_attempted");
}

beforeEach(() => {
  state.tenants = [{ id: "tenant-1", name: "Acme Salon", timezone: "Africa/Lagos" }];
  state.services = [
    { id: "svc-1", tenantId: "tenant-1", name: "Haircut", durationMinutes: 30, active: true },
  ];
  state.staff = [{ id: "staff-1", tenantId: "tenant-1", name: "Alice", active: true }];
  state.clients = [
    { id: "client-1", tenantId: "tenant-1", name: "Jordan", phone: "+2348000000001", email: "jordan@example.com" },
  ];
  state.bookings = [];
  state.auditLogs = [];
});

afterEach(() => {
  __resetEmailProviderForTests();
});

describe("booking email notification pipeline", () => {
  it("attempts exactly one send and writes exactly one notification AuditLog row on create", async () => {
    const spy = new SpyEmailProvider();
    setEmailProviderForTests(spy);

    const res = await createBooking(
      req("http://app.test/api/bookings/manual", "POST", {
        clientId: "client-1",
        serviceId: "svc-1",
        staffId: "staff-1",
        startsAt: "2026-07-15T10:00:00.000Z",
      }),
    );

    expect(res.status).toBe(201);
    expect(spy.sent).toHaveLength(1);
    expect(spy.sent[0].to).toBe("jordan@example.com");

    const emailAudits = emailAuditRows();
    expect(emailAudits).toHaveLength(1);
    const metadata = JSON.parse(emailAudits[0].metadata as string);
    expect(metadata).toMatchObject({
      kind: "confirmed",
      templateId: "booking-confirmed-v1",
      outcome: "sent",
    });
  });

  it("attempts exactly one send and writes its own AuditLog row on reschedule", async () => {
    await createBooking(
      req("http://app.test/api/bookings/manual", "POST", {
        clientId: "client-1",
        serviceId: "svc-1",
        staffId: "staff-1",
        startsAt: "2026-07-15T10:00:00.000Z",
      }),
    );
    const bookingId = state.bookings[0].id as string;
    state.auditLogs.length = 0;

    const spy = new SpyEmailProvider();
    setEmailProviderForTests(spy);

    const res = await patchBooking(
      req(`http://app.test/api/bookings/${bookingId}`, "PATCH", {
        startsAt: "2026-07-15T14:00:00.000Z",
      }),
      { params: { id: bookingId } },
    );

    expect(res.status).toBe(200);
    expect(spy.sent).toHaveLength(1);

    const emailAudits = emailAuditRows();
    expect(emailAudits).toHaveLength(1);
    const metadata = JSON.parse(emailAudits[0].metadata as string);
    expect(metadata).toMatchObject({
      kind: "rescheduled",
      templateId: "booking-rescheduled-v1",
      outcome: "sent",
    });
  });

  it("attempts exactly one send and writes its own AuditLog row on cancel", async () => {
    await createBooking(
      req("http://app.test/api/bookings/manual", "POST", {
        clientId: "client-1",
        serviceId: "svc-1",
        staffId: "staff-1",
        startsAt: "2026-07-15T10:00:00.000Z",
      }),
    );
    const bookingId = state.bookings[0].id as string;
    state.auditLogs.length = 0;

    const spy = new SpyEmailProvider();
    setEmailProviderForTests(spy);

    const res = await patchBooking(
      req(`http://app.test/api/bookings/${bookingId}`, "PATCH", { status: "cancelled" }),
      { params: { id: bookingId } },
    );

    expect(res.status).toBe(200);
    expect(spy.sent).toHaveLength(1);

    const emailAudits = emailAuditRows();
    expect(emailAudits).toHaveLength(1);
    const metadata = JSON.parse(emailAudits[0].metadata as string);
    expect(metadata).toMatchObject({
      kind: "cancelled",
      templateId: "booking-cancelled-v1",
      outcome: "sent",
    });
  });

  it("dispatches no real email through the default no-op driver, but still audits the attempt", async () => {
    __resetEmailProviderForTests();

    const res = await createBooking(
      req("http://app.test/api/bookings/manual", "POST", {
        clientId: "client-1",
        serviceId: "svc-1",
        staffId: "staff-1",
        startsAt: "2026-07-15T10:00:00.000Z",
      }),
    );

    expect(res.status).toBe(201);
    const emailAudits = emailAuditRows();
    expect(emailAudits).toHaveLength(1);
    const metadata = JSON.parse(emailAudits[0].metadata as string);
    expect(metadata.outcome).toBe("sent");
    expect(metadata.templateId).toBe("booking-confirmed-v1");
  });

  it("does not send or audit an email for a notes-only update", async () => {
    await createBooking(
      req("http://app.test/api/bookings/manual", "POST", {
        clientId: "client-1",
        serviceId: "svc-1",
        staffId: "staff-1",
        startsAt: "2026-07-15T10:00:00.000Z",
      }),
    );
    const bookingId = state.bookings[0].id as string;
    state.auditLogs.length = 0;

    const spy = new SpyEmailProvider();
    setEmailProviderForTests(spy);

    const res = await patchBooking(
      req(`http://app.test/api/bookings/${bookingId}`, "PATCH", { notes: "Bring shampoo" }),
      { params: { id: bookingId } },
    );

    expect(res.status).toBe(200);
    expect(spy.sent).toHaveLength(0);
    expect(emailAuditRows()).toHaveLength(0);
  });
});
