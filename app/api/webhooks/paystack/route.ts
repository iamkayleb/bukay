import { PrismaClient } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

import { getIdempotencyStore, type IdempotencyStore } from "@/app/lib/idempotency";
import { verifyPaystackSignature } from "@/app/lib/payments/signature";

export const dynamic = "force-dynamic";

type HandledEvent = "charge.success" | "charge.failed" | "refund.processed";

const HANDLED_EVENTS: ReadonlySet<string> = new Set([
  "charge.success",
  "charge.failed",
  "refund.processed",
]);

type PaystackWebhookPayload = {
  event?: string;
  data?: {
    id?: number | string;
    reference?: string;
    amount?: number;
    currency?: string;
    metadata?: Record<string, unknown> | string | null;
    [key: string]: unknown;
  };
};

type PaymentRow = {
  id: string;
  tenantId: string;
  bookingId: string;
  status: string;
  providerRef: string | null;
};

export type PaystackWebhookDb = {
  payment: {
    findFirst(args: { where: { providerRef: string } }): Promise<PaymentRow | null>;
    update(args: {
      where: { id: string };
      data: { status: string; paidAt?: Date | null };
    }): Promise<PaymentRow>;
  };
  booking: {
    update(args: { where: { id: string }; data: { status: string } }): Promise<unknown>;
  };
  deadLetter: {
    create(args: {
      data: {
        tenantId?: string | null;
        source: string;
        eventType: string;
        payload: string;
        reason?: string | null;
      };
    }): Promise<unknown>;
  };
};

export type PaystackWebhookDeps = {
  db?: PaystackWebhookDb;
  idempotency?: IdempotencyStore;
  secret?: string;
};

const globalForDb = globalThis as unknown as { paystackWebhookDb?: PrismaClient };

function defaultDb(): PaystackWebhookDb {
  if (!globalForDb.paystackWebhookDb) {
    // Unguarded client: webhooks resolve payments by providerRef across tenants.
    globalForDb.paystackWebhookDb = new PrismaClient();
  }
  return globalForDb.paystackWebhookDb as unknown as PaystackWebhookDb;
}

export function __setPaystackWebhookDbForTests(db: PaystackWebhookDb | null): void {
  globalForDb.paystackWebhookDb = db as PrismaClient | undefined;
}

function eventIdempotencyKey(event: string, data: PaystackWebhookPayload["data"]): string {
  const id = data?.id != null ? String(data.id) : "";
  const reference = typeof data?.reference === "string" ? data.reference : "";
  return `paystack:${event}:${id || reference || "unknown"}`;
}

function bookingStatusFor(event: HandledEvent): string {
  switch (event) {
    case "charge.success":
      return "confirmed";
    case "charge.failed":
      return "cancelled";
    case "refund.processed":
      return "cancelled";
  }
}

function paymentStatusFor(event: HandledEvent): string {
  switch (event) {
    case "charge.success":
      return "paid";
    case "charge.failed":
      return "failed";
    case "refund.processed":
      return "refunded";
  }
}

async function applyEvent(
  db: PaystackWebhookDb,
  event: HandledEvent,
  reference: string
): Promise<{ ok: true; paymentId: string; bookingId: string } | { ok: false; error: string }> {
  const payment = await db.payment.findFirst({ where: { providerRef: reference } });
  if (!payment) {
    return { ok: false, error: "payment_not_found" };
  }

  const paymentStatus = paymentStatusFor(event);
  const bookingStatus = bookingStatusFor(event);
  const paymentData: { status: string; paidAt?: Date | null } = { status: paymentStatus };
  if (event === "charge.success") {
    paymentData.paidAt = new Date();
  } else if (event === "refund.processed") {
    paymentData.paidAt = null;
  }

  await db.payment.update({
    where: { id: payment.id },
    data: paymentData,
  });

  await db.booking.update({
    where: { id: payment.bookingId },
    data: { status: bookingStatus },
  });

  return { ok: true, paymentId: payment.id, bookingId: payment.bookingId };
}

export async function handlePaystackWebhook(
  request: NextRequest | Request,
  deps: PaystackWebhookDeps = {}
): Promise<NextResponse> {
  const rawBody = await request.text();
  const signature =
    request.headers.get("x-paystack-signature") ?? request.headers.get("X-Paystack-Signature");

  if (!verifyPaystackSignature(rawBody, signature, deps.secret)) {
    return NextResponse.json({ ok: false, error: "invalid_signature" }, { status: 401 });
  }

  let payload: PaystackWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as PaystackWebhookPayload;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const event = typeof payload.event === "string" ? payload.event : "";
  const data = payload.data ?? {};
  const db = deps.db ?? defaultDb();
  const idempotency = deps.idempotency ?? getIdempotencyStore();
  const key = eventIdempotencyKey(event, data);

  if (!idempotency.claim(key)) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  if (!HANDLED_EVENTS.has(event as HandledEvent)) {
    await db.deadLetter.create({
      data: {
        source: "paystack",
        eventType: event || "unknown",
        payload: rawBody,
        reason: "unhandled_event",
      },
    });
    return NextResponse.json({ ok: true, deadLetter: true });
  }

  const reference = typeof data.reference === "string" ? data.reference.trim() : "";
  if (!reference) {
    await db.deadLetter.create({
      data: {
        source: "paystack",
        eventType: event,
        payload: rawBody,
        reason: "missing_reference",
      },
    });
    return NextResponse.json({ ok: false, error: "missing_reference" }, { status: 422 });
  }

  const result = await applyEvent(db, event as HandledEvent, reference);
  if (!result.ok) {
    await db.deadLetter.create({
      data: {
        source: "paystack",
        eventType: event,
        payload: rawBody,
        reason: result.error,
      },
    });
    return NextResponse.json({ ok: false, error: result.error }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    event,
    paymentId: result.paymentId,
    bookingId: result.bookingId,
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return handlePaystackWebhook(request);
}
