import { createHmac } from "node:crypto";

import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  IDEMPOTENCY_TTL_MS,
  IdempotencyStore,
  __resetIdempotencyStoreForTests,
} from "@/app/lib/idempotency";
import { signPaystackBody, verifyPaystackSignature } from "@/app/lib/payments/signature";
import {
  __setPaystackWebhookDbForTests,
  handlePaystackWebhook,
  type PaystackWebhookDb,
} from "@/app/api/webhooks/paystack/route";

const SECRET = "sk_test_paystack_webhook_secret_key";

type PaymentRow = {
  id: string;
  tenantId: string;
  bookingId: string;
  status: string;
  providerRef: string | null;
  paidAt: Date | null;
};

type BookingRow = {
  id: string;
  tenantId: string;
  status: string;
};

type DeadLetterRow = {
  source: string;
  eventType: string;
  payload: string;
  reason?: string | null;
  tenantId?: string | null;
};

function createDb(seed?: { payment?: PaymentRow; booking?: BookingRow }) {
  const payment: PaymentRow = seed?.payment ?? {
    id: "pay-1",
    tenantId: "tenant-1",
    bookingId: "book-1",
    status: "pending",
    providerRef: "ref-abc",
    paidAt: null,
  };
  const booking: BookingRow = seed?.booking ?? {
    id: "book-1",
    tenantId: "tenant-1",
    status: "pending_payment",
  };
  const deadLetters: DeadLetterRow[] = [];
  const paymentUpdates: Array<{ status: string; paidAt?: Date | null }> = [];
  const bookingUpdates: Array<{ status: string }> = [];

  const db: PaystackWebhookDb = {
    payment: {
      findFirst: vi.fn(async ({ where }) =>
        payment.providerRef === where.providerRef ? { ...payment } : null
      ),
      update: vi.fn(async ({ where, data }) => {
        if (where.id !== payment.id) throw new Error("payment not found");
        Object.assign(payment, data);
        paymentUpdates.push({ ...data });
        return { ...payment };
      }),
    },
    booking: {
      update: vi.fn(async ({ where, data }) => {
        if (where.id !== booking.id) throw new Error("booking not found");
        Object.assign(booking, data);
        bookingUpdates.push({ ...data });
        return { ...booking };
      }),
    },
    deadLetter: {
      create: vi.fn(async ({ data }) => {
        deadLetters.push({ ...data });
        return { id: `dl-${deadLetters.length}`, ...data };
      }),
    },
  };

  return { db, payment, booking, deadLetters, paymentUpdates, bookingUpdates };
}

function signedRequest(body: unknown, secret = SECRET, signature?: string) {
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  const sig = signature ?? signPaystackBody(raw, secret);
  return new NextRequest("http://app.test/api/webhooks/paystack", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-paystack-signature": sig,
    },
    body: raw,
  });
}

function eventBody(event: string, overrides: { id?: number | string; reference?: string } = {}) {
  return {
    event,
    data: {
      id: overrides.id ?? 10_001,
      reference: overrides.reference ?? "ref-abc",
      amount: 5000,
      currency: "NGN",
    },
  };
}

describe("verifyPaystackSignature", () => {
  it("accepts a matching HMAC-SHA512 signature", () => {
    const body = '{"event":"charge.success"}';
    const signature = createHmac("sha512", SECRET).update(body).digest("hex");
    expect(verifyPaystackSignature(body, signature, SECRET)).toBe(true);
  });

  it("rejects a mismatched signature", () => {
    expect(verifyPaystackSignature('{"event":"charge.success"}', "deadbeef", SECRET)).toBe(false);
  });
});

describe("IdempotencyStore", () => {
  class FakeClock {
    constructor(public t = 1_700_000_000_000) {}
    now() {
      return this.t;
    }
    advance(ms: number) {
      this.t += ms;
    }
  }

  it("claims a key once within the 7-day TTL", () => {
    const clock = new FakeClock();
    const store = new IdempotencyStore(clock);
    expect(store.claim("evt-1")).toBe(true);
    expect(store.claim("evt-1")).toBe(false);
    expect(store.has("evt-1")).toBe(true);
  });

  it("expires keys after 7 days", () => {
    const clock = new FakeClock();
    const store = new IdempotencyStore(clock);
    expect(store.claim("evt-1")).toBe(true);
    clock.advance(IDEMPOTENCY_TTL_MS + 1);
    expect(store.has("evt-1")).toBe(false);
    expect(store.claim("evt-1")).toBe(true);
  });
});

describe("POST /api/webhooks/paystack", () => {
  let store: IdempotencyStore;

  beforeEach(() => {
    store = new IdempotencyStore();
    __resetIdempotencyStoreForTests();
  });

  afterEach(() => {
    __setPaystackWebhookDbForTests(null);
    __resetIdempotencyStoreForTests();
  });

  it("returns HTTP 401 when the signature does not match", async () => {
    const { db } = createDb();
    const res = await handlePaystackWebhook(
      signedRequest(eventBody("charge.success"), SECRET, "not-a-valid-signature"),
      { db, idempotency: store, secret: SECRET }
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ ok: false, error: "invalid_signature" });
    expect(db.payment.update).not.toHaveBeenCalled();
    expect(db.booking.update).not.toHaveBeenCalled();
  });

  it("marks payment paid and booking confirmed on charge.success", async () => {
    const { db, payment, booking } = createDb();
    const res = await handlePaystackWebhook(signedRequest(eventBody("charge.success")), {
      db,
      idempotency: store,
      secret: SECRET,
    });
    expect(res.status).toBe(200);
    expect(payment.status).toBe("paid");
    expect(payment.paidAt).toBeInstanceOf(Date);
    expect(booking.status).toBe("confirmed");
  });

  it("marks payment failed and booking cancelled on charge.failed", async () => {
    const { db, payment, booking } = createDb();
    const res = await handlePaystackWebhook(signedRequest(eventBody("charge.failed")), {
      db,
      idempotency: store,
      secret: SECRET,
    });
    expect(res.status).toBe(200);
    expect(payment.status).toBe("failed");
    expect(booking.status).toBe("cancelled");
  });

  it("marks payment refunded and booking cancelled on refund.processed", async () => {
    const { db, payment, booking } = createDb({
      payment: {
        id: "pay-1",
        tenantId: "tenant-1",
        bookingId: "book-1",
        status: "paid",
        providerRef: "ref-abc",
        paidAt: new Date(),
      },
      booking: { id: "book-1", tenantId: "tenant-1", status: "confirmed" },
    });
    const res = await handlePaystackWebhook(signedRequest(eventBody("refund.processed")), {
      db,
      idempotency: store,
      secret: SECRET,
    });
    expect(res.status).toBe(200);
    expect(payment.status).toBe("refunded");
    expect(booking.status).toBe("cancelled");
  });

  it("produces no state change when the same event is replayed", async () => {
    const { db, payment, booking, paymentUpdates, bookingUpdates } = createDb();
    const body = eventBody("charge.success", { id: 42 });

    const first = await handlePaystackWebhook(signedRequest(body), {
      db,
      idempotency: store,
      secret: SECRET,
    });
    expect(first.status).toBe(200);
    expect(payment.status).toBe("paid");
    expect(booking.status).toBe("confirmed");
    expect(paymentUpdates).toHaveLength(1);
    expect(bookingUpdates).toHaveLength(1);

    // Mutate state to prove a replay would be visible if applied again.
    payment.status = "tampered";
    booking.status = "tampered";

    const second = await handlePaystackWebhook(signedRequest(body), {
      db,
      idempotency: store,
      secret: SECRET,
    });
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({ ok: true, duplicate: true });
    expect(payment.status).toBe("tampered");
    expect(booking.status).toBe("tampered");
    expect(paymentUpdates).toHaveLength(1);
    expect(bookingUpdates).toHaveLength(1);
    expect(db.payment.update).toHaveBeenCalledTimes(1);
    expect(db.booking.update).toHaveBeenCalledTimes(1);
  });

  it("routes unknown events to the dead letter table", async () => {
    const { db, deadLetters } = createDb();
    const body = eventBody("subscription.create", { id: 99 });
    const res = await handlePaystackWebhook(signedRequest(body), {
      db,
      idempotency: store,
      secret: SECRET,
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, deadLetter: true });
    expect(deadLetters).toHaveLength(1);
    expect(deadLetters[0]).toMatchObject({
      source: "paystack",
      eventType: "subscription.create",
      reason: "unhandled_event",
    });
    expect(db.payment.update).not.toHaveBeenCalled();
  });
});
