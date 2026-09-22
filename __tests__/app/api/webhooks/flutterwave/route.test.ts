import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { IdempotencyStore, __resetIdempotencyStoreForTests } from "@/app/lib/idempotency";
import {
  __setFlutterwaveWebhookDbForTests,
  handleFlutterwaveWebhook,
  normalizeFlutterwaveEvent,
  tenantIdFromFlutterwaveMeta,
  type FlutterwaveWebhookDb,
} from "@/app/lib/payments/flutterwave-webhook";
import { verifyFlutterwaveSignature } from "@/app/lib/payments/signature";
import * as flutterwaveRoute from "@/app/api/webhooks/flutterwave/route";
import { POST as flutterwaveRoutePost } from "@/app/api/webhooks/flutterwave/route";

const SECRET_HASH = "flw_secret_hash_abcdefghijklmnopqrstuvwxyz";

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
  const paymentUpdates: Array<{ status: string; paidAt?: Date | null; provider?: string }> = [];
  const bookingUpdates: Array<{ status: string }> = [];

  const db: FlutterwaveWebhookDb = {
    payment: {
      findFirst: vi.fn(async ({ where }) => {
        if (payment.providerRef !== where.providerRef) return null;
        if (where.tenantId && payment.tenantId !== where.tenantId) return null;
        return { ...payment };
      }),
      update: vi.fn(async ({ where, data }) => {
        if (where.id !== payment.id) throw new Error("payment not found");
        if (where.tenantId !== payment.tenantId) throw new Error("payment tenant mismatch");
        Object.assign(payment, data);
        paymentUpdates.push({ ...data });
        return { ...payment };
      }),
    },
    booking: {
      update: vi.fn(async ({ where, data }) => {
        if (where.id !== booking.id) throw new Error("booking not found");
        if (where.tenantId !== booking.tenantId) throw new Error("booking tenant mismatch");
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
      deleteMany: vi.fn(async () => ({ count: 0 })),
    },
  };

  return {
    db,
    payment,
    booking,
    deadLetters,
    paymentUpdates,
    bookingUpdates,
  };
}

function signedRequest(body: unknown, secretHash = SECRET_HASH, signature?: string) {
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  return new NextRequest("http://app.test/api/webhooks/flutterwave", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "verif-hash": signature ?? secretHash,
    },
    body: raw,
  });
}

function eventBody(
  event: string,
  overrides: {
    id?: number | string;
    tx_ref?: string;
    status?: string;
    meta?: Record<string, unknown> | string | null;
  } = {}
) {
  return {
    event,
    data: {
      id: overrides.id ?? 10_001,
      tx_ref: overrides.tx_ref ?? "ref-abc",
      amount: 5000,
      currency: "NGN",
      status: overrides.status ?? "successful",
      ...(overrides.meta !== undefined ? { meta: overrides.meta } : {}),
    },
  };
}

describe("verifyFlutterwaveSignature", () => {
  it("accepts a matching verif-hash secret", () => {
    expect(verifyFlutterwaveSignature("{}", SECRET_HASH, SECRET_HASH)).toBe(true);
  });

  it("rejects a mismatched hash", () => {
    expect(verifyFlutterwaveSignature("{}", "wrong", SECRET_HASH)).toBe(false);
  });

  it("rejects a missing signature", () => {
    expect(verifyFlutterwaveSignature("{}", null, SECRET_HASH)).toBe(false);
  });
});

describe("normalizeFlutterwaveEvent", () => {
  it("maps charge.completed + successful to charge.success", () => {
    expect(normalizeFlutterwaveEvent("charge.completed", "successful")).toBe("charge.success");
    expect(normalizeFlutterwaveEvent("charge.completed", "failed")).toBe("charge.failed");
  });
});

describe("tenantIdFromFlutterwaveMeta", () => {
  it("reads tenantId from meta objects and JSON strings", () => {
    expect(tenantIdFromFlutterwaveMeta({ tenantId: "tenant-1" })).toBe("tenant-1");
    expect(tenantIdFromFlutterwaveMeta(JSON.stringify({ tenantId: "tenant-2" }))).toBe("tenant-2");
    expect(tenantIdFromFlutterwaveMeta(null)).toBeNull();
  });
});

describe("POST /api/webhooks/flutterwave", () => {
  let store: IdempotencyStore;

  beforeEach(() => {
    store = new IdempotencyStore();
    __resetIdempotencyStoreForTests();
  });

  afterEach(() => {
    __setFlutterwaveWebhookDbForTests(null);
    __resetIdempotencyStoreForTests();
  });

  it("exports only Next.js route symbols from the route module", () => {
    expect(Object.keys(flutterwaveRoute).sort()).toEqual(["POST", "dynamic"].sort());
  });

  it("returns HTTP 401 when the verif-hash does not match", async () => {
    const { db } = createDb();
    const res = await handleFlutterwaveWebhook(
      signedRequest(eventBody("charge.completed"), SECRET_HASH, "not-the-hash"),
      { db, idempotency: store, secretHash: SECRET_HASH }
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ ok: false, error: "invalid_signature" });
    expect(db.payment.update).not.toHaveBeenCalled();
  });

  it("marks payment paid and booking confirmed on charge.completed successful", async () => {
    const { db, payment, booking } = createDb();
    const res = await handleFlutterwaveWebhook(signedRequest(eventBody("charge.completed")), {
      db,
      idempotency: store,
      secretHash: SECRET_HASH,
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      ok: true,
      event: "charge.success",
      paymentId: "pay-1",
      bookingId: "book-1",
      tenantId: "tenant-1",
    });
    expect(payment.status).toBe("paid");
    expect(payment.paidAt).toBeInstanceOf(Date);
    expect(booking.status).toBe("confirmed");
  });

  it("marks payment failed on charge.completed failed", async () => {
    const { db, payment, booking } = createDb();
    const res = await handleFlutterwaveWebhook(
      signedRequest(eventBody("charge.completed", { status: "failed" })),
      { db, idempotency: store, secretHash: SECRET_HASH }
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, event: "charge.failed" });
    expect(payment.status).toBe("failed");
    expect(booking.status).toBe("cancelled");
  });

  it("returns duplicate:true on replayed events", async () => {
    const { db } = createDb();
    const reqBody = eventBody("charge.completed");
    const first = await handleFlutterwaveWebhook(signedRequest(reqBody), {
      db,
      idempotency: store,
      secretHash: SECRET_HASH,
    });
    expect(first.status).toBe(200);
    const second = await handleFlutterwaveWebhook(signedRequest(reqBody), {
      db,
      idempotency: store,
      secretHash: SECRET_HASH,
    });
    expect(await second.json()).toEqual({ ok: true, duplicate: true });
  });

  it("dead-letters unhandled events", async () => {
    const { db, deadLetters } = createDb();
    const res = await handleFlutterwaveWebhook(signedRequest(eventBody("transfer.completed")), {
      db,
      idempotency: store,
      secretHash: SECRET_HASH,
    });
    expect(await res.json()).toEqual({ ok: true, deadLetter: true });
    expect(deadLetters).toHaveLength(1);
    expect(deadLetters[0].source).toBe("flutterwave");
    expect(deadLetters[0].reason).toBe("unhandled_event");
  });

  it("route POST delegates to the shared handler", async () => {
    const { db } = createDb();
    __setFlutterwaveWebhookDbForTests(db);
    const prev = process.env.FLW_SECRET_HASH;
    process.env.FLW_SECRET_HASH = SECRET_HASH;
    try {
      const res = await flutterwaveRoutePost(signedRequest(eventBody("charge.completed")));
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ ok: true, event: "charge.success" });
    } finally {
      if (prev === undefined) delete process.env.FLW_SECRET_HASH;
      else process.env.FLW_SECRET_HASH = prev;
    }
  });
});
