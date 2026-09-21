import { createHmac } from "node:crypto";

import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  IDEMPOTENCY_TTL_MS,
  IdempotencyStore,
  __resetIdempotencyStoreForTests,
  claimIdempotencyKey,
} from "@/app/lib/idempotency";
import { DEAD_LETTER_RETENTION_MS, purgeExpiredDeadLetters } from "@/app/lib/payments/dead-letter";
import {
  __setPaystackWebhookDbForTests,
  handlePaystackWebhook,
  type PaystackWebhookDb,
} from "@/app/lib/payments/paystack-webhook";
import { signPaystackBody, verifyPaystackSignature } from "@/app/lib/payments/signature";

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
  createdAt?: Date;
};

type IdempotencyRow = {
  key: string;
  expiresAt: Date;
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
  const idempotencyKeys = new Map<string, IdempotencyRow>();
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
        deadLetters.push({ ...data, createdAt: new Date() });
        return { id: `dl-${deadLetters.length}`, ...data };
      }),
      deleteMany: vi.fn(async ({ where }) => {
        const cutoff = where.createdAt.lte.getTime();
        let count = 0;
        for (let i = deadLetters.length - 1; i >= 0; i--) {
          const created = deadLetters[i].createdAt?.getTime() ?? Date.now();
          if (created <= cutoff) {
            deadLetters.splice(i, 1);
            count += 1;
          }
        }
        return { count };
      }),
    },
    idempotencyKey: {
      findUnique: vi.fn(async ({ where }) => {
        const row = idempotencyKeys.get(where.key);
        return row ? { ...row } : null;
      }),
      create: vi.fn(async ({ data }) => {
        if (idempotencyKeys.has(data.key)) {
          throw Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
        }
        const row = { key: data.key, expiresAt: data.expiresAt };
        idempotencyKeys.set(data.key, row);
        return { ...row };
      }),
      deleteMany: vi.fn(async ({ where }) => {
        let count = 0;
        for (const [k, row] of [...idempotencyKeys.entries()]) {
          if (where.key && k !== where.key) continue;
          if (where.expiresAt?.lte && row.expiresAt.getTime() > where.expiresAt.lte.getTime()) {
            continue;
          }
          if (where.key || where.expiresAt) {
            idempotencyKeys.delete(k);
            count += 1;
          }
        }
        return { count };
      }),
    },
  };

  return {
    db,
    payment,
    booking,
    deadLetters,
    idempotencyKeys,
    paymentUpdates,
    bookingUpdates,
  };
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

  it("rejects a missing signature", () => {
    expect(verifyPaystackSignature('{"event":"charge.success"}', null, SECRET)).toBe(false);
  });
});

describe("IdempotencyStore (in-memory)", () => {
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

describe("claimIdempotencyKey (durable)", () => {
  it("claims once and rejects replays until expiry", async () => {
    const { db, idempotencyKeys } = createDb();
    const now = new Date("2026-09-21T12:00:00.000Z");
    expect(
      await claimIdempotencyKey(db, "paystack:charge.success:1", IDEMPOTENCY_TTL_MS, now)
    ).toBe(true);
    expect(idempotencyKeys.size).toBe(1);
    expect(
      await claimIdempotencyKey(db, "paystack:charge.success:1", IDEMPOTENCY_TTL_MS, now)
    ).toBe(false);
  });

  it("allows reclaim after TTL expiry", async () => {
    const { db } = createDb();
    const now = new Date("2026-09-21T12:00:00.000Z");
    expect(await claimIdempotencyKey(db, "k", IDEMPOTENCY_TTL_MS, now)).toBe(true);
    const afterTtl = new Date(now.getTime() + IDEMPOTENCY_TTL_MS + 1);
    expect(await claimIdempotencyKey(db, "k", IDEMPOTENCY_TTL_MS, afterTtl)).toBe(true);
  });
});

describe("purgeExpiredDeadLetters", () => {
  it("removes rows older than the retention window", async () => {
    const { db, deadLetters } = createDb();
    const now = new Date("2026-09-21T12:00:00.000Z");
    deadLetters.push({
      source: "paystack",
      eventType: "old",
      payload: "{}",
      reason: "unhandled_event",
      createdAt: new Date(now.getTime() - DEAD_LETTER_RETENTION_MS - 1),
    });
    deadLetters.push({
      source: "paystack",
      eventType: "fresh",
      payload: "{}",
      reason: "unhandled_event",
      createdAt: now,
    });
    const purged = await purgeExpiredDeadLetters(db, now);
    expect(purged).toBe(1);
    expect(deadLetters).toHaveLength(1);
    expect(deadLetters[0].eventType).toBe("fresh");
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
    expect(await res.json()).toMatchObject({
      ok: true,
      event: "charge.success",
      paymentId: "pay-1",
      bookingId: "book-1",
    });
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
    expect(payment.paidAt).toBeNull();
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

  it("uses durable DB idempotency when no in-memory store is injected", async () => {
    const { db, payment, idempotencyKeys } = createDb();
    const body = eventBody("charge.success", { id: 77 });

    const first = await handlePaystackWebhook(signedRequest(body), {
      db,
      secret: SECRET,
    });
    expect(first.status).toBe(200);
    expect(payment.status).toBe("paid");
    expect(idempotencyKeys.size).toBe(1);

    payment.status = "tampered";
    const second = await handlePaystackWebhook(signedRequest(body), {
      db,
      secret: SECRET,
    });
    expect(await second.json()).toEqual({ ok: true, duplicate: true });
    expect(payment.status).toBe("tampered");
    expect(db.payment.update).toHaveBeenCalledTimes(1);
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

  it("dead-letters missing payments without mutating booking state", async () => {
    const { db, booking, deadLetters } = createDb({
      payment: {
        id: "pay-1",
        tenantId: "tenant-1",
        bookingId: "book-1",
        status: "pending",
        providerRef: "other-ref",
        paidAt: null,
      },
    });
    const res = await handlePaystackWebhook(signedRequest(eventBody("charge.success")), {
      db,
      idempotency: store,
      secret: SECRET,
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ ok: false, error: "payment_not_found" });
    expect(booking.status).toBe("pending_payment");
    expect(deadLetters).toHaveLength(1);
    expect(deadLetters[0].reason).toBe("payment_not_found");
  });

  it("rejects missing payment references with 422 and dead-letters the payload", async () => {
    const { db, deadLetters } = createDb();
    const body = {
      event: "charge.success",
      data: { id: 55, amount: 1000, currency: "NGN" },
    };
    const res = await handlePaystackWebhook(signedRequest(body), {
      db,
      idempotency: store,
      secret: SECRET,
    });
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ ok: false, error: "missing_reference" });
    expect(deadLetters[0]).toMatchObject({
      reason: "missing_reference",
      eventType: "charge.success",
    });
  });
});
