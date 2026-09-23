import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

type PaymentRow = {
  id: string;
  tenantId: string;
  bookingId: string;
  kind: string;
  status: string;
  paidAt: Date | null;
};

type BookingRow = { id: string; tenantId: string; status: string };

const state = vi.hoisted(() => ({
  payments: [] as PaymentRow[],
  bookings: [] as BookingRow[],
}));

vi.mock("@/app/db/prisma", () => ({
  prisma: {
    payment: {
      findFirst: vi.fn(
        async (args: {
          where: { tenantId: string; bookingId: string; kind: string; status: string };
        }) =>
          state.payments.find(
            (payment) =>
              payment.tenantId === args.where.tenantId &&
              payment.bookingId === args.where.bookingId &&
              payment.kind === args.where.kind &&
              payment.status === args.where.status
          ) ?? null
      ),
      update: vi.fn(async (args: { where: { id: string }; data: Partial<PaymentRow> }) => {
        const index = state.payments.findIndex((payment) => payment.id === args.where.id);
        state.payments[index] = { ...state.payments[index], ...args.data };
        return state.payments[index];
      }),
    },
    booking: {
      update: vi.fn(async (args: { where: { id: string }; data: Partial<BookingRow> }) => {
        const index = state.bookings.findIndex((booking) => booking.id === args.where.id);
        state.bookings[index] = { ...state.bookings[index], ...args.data };
        return state.bookings[index];
      }),
    },
  },
}));

import { POST } from "@/app/api/payments/capture/route";

function request(body: unknown, headers: Record<string, string> = { "x-tenant-id": "tenant-1" }) {
  return new NextRequest("http://app.test/api/payments/capture", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  state.payments = [
    {
      id: "payment-balance-1",
      tenantId: "tenant-1",
      bookingId: "booking-1",
      kind: "balance",
      status: "pending",
      paidAt: null,
    },
  ];
  state.bookings = [{ id: "booking-1", tenantId: "tenant-1", status: "confirmed_partial" }];
});

describe("POST /api/payments/capture", () => {
  it("captures the pending balance and closes the booking", async () => {
    const response = await POST(request({ bookingId: "booking-1" }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      bookingId: "booking-1",
      status: "confirmed",
    });
    expect(state.payments[0]).toMatchObject({ status: "success" });
    expect(state.payments[0].paidAt).toBeInstanceOf(Date);
    expect(state.bookings[0].status).toBe("confirmed");
  });

  it("returns 404 when there is no pending balance for the booking", async () => {
    state.payments = [];

    const response = await POST(request({ bookingId: "booking-1" }));

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ ok: false, error: "balance_not_found" });
    expect(state.bookings[0].status).toBe("confirmed_partial");
  });

  it("scopes the balance lookup to the resolved tenant", async () => {
    const response = await POST(request({ bookingId: "booking-1" }, { "x-tenant-id": "other" }));

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ ok: false, error: "balance_not_found" });
  });

  it("rejects a request without a bookingId", async () => {
    const response = await POST(request({}));

    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe("validation_failed");
  });
});
