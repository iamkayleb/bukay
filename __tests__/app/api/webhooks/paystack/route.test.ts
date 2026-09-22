import { createHmac } from "node:crypto";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const SECRET = "sk_test_secret";

type PaymentRow = {
  id: string;
  tenantId: string;
  bookingId: string;
  providerRef: string;
  status: string;
  paidAt: Date | null;
};

type BookingRow = {
  id: string;
  tenantId: string;
  staffId: string | null;
  startsAt: Date;
  endsAt: Date;
  status: string;
};

const state = vi.hoisted(() => ({
  payments: [] as PaymentRow[],
  bookings: [] as BookingRow[],
  deadLetters: [] as Array<{
    provider: string;
    eventType: string;
    payload: string;
    reason?: string;
  }>,
  idempotencyKeys: new Map<string, { key: string; expiresAt: Date }>(),
  findPaymentFirst: vi.fn(),
  updatePayment: vi.fn(),
  updateBooking: vi.fn(),
  createDeadLetter: vi.fn(),
}));

vi.mock("@/app/db/prisma", () => ({
  prisma: {
    payment: {
      findFirst: state.findPaymentFirst,
      update: state.updatePayment,
    },
    booking: {
      update: state.updateBooking,
    },
    deadLetterEvent: {
      create: state.createDeadLetter,
    },
    idempotencyKey: {
      findUnique: async ({ where: { key } }: { where: { key: string } }) =>
        state.idempotencyKeys.get(key) ?? null,
      upsert: async ({
        where: { key },
        create,
      }: {
        where: { key: string };
        create: { key: string; expiresAt: Date };
      }) => {
        const entry = { key, expiresAt: create.expiresAt };
        state.idempotencyKeys.set(key, entry);
        return entry;
      },
      deleteMany: async () => {
        state.idempotencyKeys.clear();
      },
    },
  },
}));

import { POST } from "@/app/api/webhooks/paystack/route";
import { __resetIdempotencyStoreForTests } from "@/app/lib/idempotency";
import { __resetDomainEventsForTests, onBookingConfirmed } from "@/app/lib/events";

function sign(body: string): string {
  return createHmac("sha512", SECRET).update(body, "utf8").digest("hex");
}

function request(
  payload: unknown,
  { signed = true, signatureOverride }: { signed?: boolean; signatureOverride?: string } = {}
) {
  const body = JSON.stringify(payload);
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (signatureOverride !== undefined) {
    headers["x-paystack-signature"] = signatureOverride;
  } else if (signed) {
    headers["x-paystack-signature"] = sign(body);
  }

  return new NextRequest("http://app.test/api/webhooks/paystack", {
    method: "POST",
    headers,
    body,
  });
}

function chargeSuccessPayload(overrides: Record<string, unknown> = {}) {
  return {
    event: "charge.success",
    data: {
      reference: "ref-1",
      metadata: { tenantId: "tenant-1" },
      ...overrides,
    },
  };
}

beforeEach(async () => {
  process.env.PAYSTACK_SECRET_KEY = SECRET;

  state.payments = [
    {
      id: "payment-1",
      tenantId: "tenant-1",
      bookingId: "booking-1",
      providerRef: "ref-1",
      status: "pending",
      paidAt: null,
    },
  ];
  state.bookings = [
    {
      id: "booking-1",
      tenantId: "tenant-1",
      staffId: "staff-1",
      startsAt: new Date("2026-07-27T10:00:00.000Z"),
      endsAt: new Date("2026-07-27T11:00:00.000Z"),
      status: "pending",
    },
  ];
  state.deadLetters = [];

  state.findPaymentFirst.mockReset();
  state.updatePayment.mockReset();
  state.updateBooking.mockReset();
  state.createDeadLetter.mockReset();

  state.findPaymentFirst.mockImplementation(
    async (args: { where: { tenantId: string; providerRef: string } }) =>
      state.payments.find(
        (row) => row.tenantId === args.where.tenantId && row.providerRef === args.where.providerRef
      ) ?? null
  );
  state.updatePayment.mockImplementation(
    async (args: { where: { id: string; tenantId: string }; data: Partial<PaymentRow> }) => {
      const index = state.payments.findIndex(
        (row) => row.id === args.where.id && row.tenantId === args.where.tenantId
      );
      state.payments[index] = { ...state.payments[index], ...args.data };
      return state.payments[index];
    }
  );
  state.updateBooking.mockImplementation(
    async (args: { where: { id: string; tenantId: string }; data: Partial<BookingRow> }) => {
      const index = state.bookings.findIndex(
        (row) => row.id === args.where.id && row.tenantId === args.where.tenantId
      );
      state.bookings[index] = { ...state.bookings[index], ...args.data };
      return state.bookings[index];
    }
  );
  state.createDeadLetter.mockImplementation(
    async (args: { data: (typeof state.deadLetters)[number] }) => {
      state.deadLetters.push(args.data);
      return args.data;
    }
  );

  await __resetIdempotencyStoreForTests();
  __resetDomainEventsForTests();
});

describe("POST /api/webhooks/paystack", () => {
  it("returns 401 for a mismatched signature", async () => {
    const res = await POST(
      request(chargeSuccessPayload(), { signatureOverride: "not-a-real-signature" })
    );

    expect(res.status).toBe(401);
    expect(state.findPaymentFirst).not.toHaveBeenCalled();
  });

  it("returns 401 when the signature header is missing", async () => {
    const res = await POST(request(chargeSuccessPayload(), { signed: false }));
    expect(res.status).toBe(401);
  });

  it("updates payment and booking state on charge.success and emits booking.confirmed", async () => {
    const handler = vi.fn();
    onBookingConfirmed(handler);

    const res = await POST(request(chargeSuccessPayload()));

    expect(res.status).toBe(200);
    expect(state.payments[0].status).toBe("success");
    expect(state.payments[0].paidAt).toBeInstanceOf(Date);
    expect(state.updatePayment).toHaveBeenCalledWith({
      where: { id: "payment-1", tenantId: "tenant-1" },
      data: { status: "success", paidAt: expect.any(Date) },
    });
    expect(state.bookings[0].status).toBe("confirmed");
    expect(handler).toHaveBeenCalledWith({
      bookingId: "booking-1",
      tenantId: "tenant-1",
      staffId: "staff-1",
      startsAt: state.bookings[0].startsAt,
      endsAt: state.bookings[0].endsAt,
    });
  });

  it("updates payment and booking state on charge.failed without emitting booking.confirmed", async () => {
    const handler = vi.fn();
    onBookingConfirmed(handler);

    const res = await POST(
      request({
        event: "charge.failed",
        data: { reference: "ref-1", metadata: { tenantId: "tenant-1" } },
      })
    );

    expect(res.status).toBe(200);
    expect(state.payments[0].status).toBe("failed");
    expect(state.bookings[0].status).toBe("payment_failed");
    expect(handler).not.toHaveBeenCalled();
  });

  it("updates payment and booking state on refund.processed using nested transaction metadata", async () => {
    const res = await POST(
      request({
        event: "refund.processed",
        data: { transaction: { reference: "ref-1", metadata: { tenantId: "tenant-1" } } },
      })
    );

    expect(res.status).toBe(200);
    expect(state.payments[0].status).toBe("refunded");
    expect(state.bookings[0].status).toBe("refunded");
  });

  it("produces no state change when the same event is replayed", async () => {
    const first = await POST(request(chargeSuccessPayload()));
    expect(first.status).toBe(200);
    expect(state.updatePayment).toHaveBeenCalledTimes(1);
    expect(state.updateBooking).toHaveBeenCalledTimes(1);

    const replayBody = await first.json();
    expect(replayBody.replayed).toBeUndefined();

    const second = await POST(request(chargeSuccessPayload()));
    const secondBody = await second.json();

    expect(second.status).toBe(200);
    expect(secondBody.replayed).toBe(true);
    expect(state.updatePayment).toHaveBeenCalledTimes(1);
    expect(state.updateBooking).toHaveBeenCalledTimes(1);
  });

  it("routes an unrecognized event type to the dead letter table without touching payment state", async () => {
    const res = await POST(
      request({
        event: "subscription.create",
        data: { reference: "ref-1", metadata: { tenantId: "tenant-1" } },
      })
    );

    expect(res.status).toBe(200);
    expect(state.updatePayment).not.toHaveBeenCalled();
    expect(state.updateBooking).not.toHaveBeenCalled();
    expect(state.createDeadLetter).toHaveBeenCalledWith({
      data: expect.objectContaining({ provider: "paystack", eventType: "subscription.create" }),
    });
  });

  it("routes a known event missing tenant metadata to the dead letter table", async () => {
    const res = await POST(request({ event: "charge.success", data: { reference: "ref-1" } }));

    expect(res.status).toBe(200);
    expect(state.updatePayment).not.toHaveBeenCalled();
    expect(state.createDeadLetter).toHaveBeenCalledWith({
      data: expect.objectContaining({ reason: "missing_reference_or_tenant" }),
    });
  });

  it("routes a known event with no matching payment to the dead letter table", async () => {
    const res = await POST(
      request({
        event: "charge.success",
        data: { reference: "unknown-ref", metadata: { tenantId: "tenant-1" } },
      })
    );

    expect(res.status).toBe(200);
    expect(state.updatePayment).not.toHaveBeenCalled();
    expect(state.createDeadLetter).toHaveBeenCalledWith({
      data: expect.objectContaining({ reason: "payment_not_found" }),
    });
  });
});
