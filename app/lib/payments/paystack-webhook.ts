import { PrismaClient } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

import { claimIdempotencyKey, type IdempotencyClaimer } from "@/app/lib/idempotency";
import { purgeExpiredDeadLetters } from "@/app/lib/payments/dead-letter";
import { verifyPaystackSignature } from "@/app/lib/payments/signature";

export type HandledEvent = "charge.success" | "charge.failed" | "refund.processed";

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
    findFirst(args: {
      where: { providerRef: string; tenantId?: string };
    }): Promise<PaymentRow | null>;
    update(args: {
      where: { id: string; tenantId: string };
      data: { status: string; paidAt?: Date | null };
    }): Promise<PaymentRow>;
  };
  booking: {
    update(args: {
      where: { id: string; tenantId: string };
      data: { status: string };
    }): Promise<unknown>;
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
    deleteMany(args: { where: { createdAt: { lte: Date } } }): Promise<{ count: number }>;
  };
  idempotencyKey?: {
    findUnique(args: { where: { key: string } }): Promise<{
      key: string;
      expiresAt: Date;
    } | null>;
    create(args: {
      data: { key: string; expiresAt: Date };
    }): Promise<{ key: string; expiresAt: Date }>;
    deleteMany(args: {
      where: { key?: string; expiresAt?: { lte: Date } };
    }): Promise<{ count: number }>;
  };
};

export type PaystackWebhookDeps = {
  db?: PaystackWebhookDb;
  idempotency?: IdempotencyClaimer;
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

/** Test-only: swap the default Prisma client. Not exported from the route module. */
export function __setPaystackWebhookDbForTests(db: PaystackWebhookDb | null): void {
  globalForDb.paystackWebhookDb = (db as unknown as PrismaClient | undefined) ?? undefined;
}

function eventIdempotencyKey(event: string, data: PaystackWebhookPayload["data"]): string {
  const id = data?.id != null ? String(data.id) : "";
  const reference = typeof data?.reference === "string" ? data.reference : "";
  return `paystack:${event}:${id || reference || "unknown"}`;
}

/** Best-effort tenant id from Paystack metadata (string field or nested object). */
export function tenantIdFromPaystackMetadata(
  metadata: PaystackWebhookPayload["data"] extends { metadata?: infer M } ? M : unknown
): string | null {
  if (metadata == null) return null;
  let parsed: unknown = metadata;
  if (typeof metadata === "string") {
    try {
      parsed = JSON.parse(metadata);
    } catch {
      return null;
    }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const raw = (parsed as Record<string, unknown>).tenantId;
  if (typeof raw !== "string") return null;
  const tenantId = raw.trim();
  return tenantId || null;
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
  reference: string,
  metadataTenantId: string | null
): Promise<
  | { ok: true; paymentId: string; bookingId: string; tenantId: string }
  | { ok: false; error: string; tenantId?: string | null }
> {
  // Resolve by provider reference first (Paystack refs are globally unique), then
  // enforce tenant agreement with optional metadata and scope all writes by tenantId.
  const payment = await db.payment.findFirst({ where: { providerRef: reference } });
  if (!payment) {
    return { ok: false, error: "payment_not_found", tenantId: metadataTenantId };
  }

  if (metadataTenantId && metadataTenantId !== payment.tenantId) {
    return { ok: false, error: "tenant_mismatch", tenantId: payment.tenantId };
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
    where: { id: payment.id, tenantId: payment.tenantId },
    data: paymentData,
  });

  await db.booking.update({
    where: { id: payment.bookingId, tenantId: payment.tenantId },
    data: { status: bookingStatus },
  });

  return {
    ok: true,
    paymentId: payment.id,
    bookingId: payment.bookingId,
    tenantId: payment.tenantId,
  };
}

async function recordDeadLetter(
  db: PaystackWebhookDb,
  rawBody: string,
  eventType: string,
  reason: string,
  tenantId?: string | null
): Promise<void> {
  await db.deadLetter.create({
    data: {
      tenantId: tenantId ?? null,
      source: "paystack",
      eventType,
      payload: rawBody,
      reason,
    },
  });
}

/**
 * Paystack webhook handler: HMAC verify → durable idempotency claim → apply
 * charge.success / charge.failed / refund.processed (or dead-letter unknowns).
 */
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

  // Retention: purge on every authenticated webhook so expired DeadLetter rows
  // (raw payment payloads) are cleaned even when only successful events arrive.
  await purgeExpiredDeadLetters(db);

  const key = eventIdempotencyKey(event, data);

  const claimed = deps.idempotency
    ? await Promise.resolve(deps.idempotency.claim(key))
    : await claimIdempotencyKey(db, key);

  if (!claimed) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  if (!HANDLED_EVENTS.has(event as HandledEvent)) {
    await recordDeadLetter(
      db,
      rawBody,
      event || "unknown",
      "unhandled_event",
      tenantIdFromPaystackMetadata(data.metadata)
    );
    return NextResponse.json({ ok: true, deadLetter: true });
  }

  const reference = typeof data.reference === "string" ? data.reference.trim() : "";
  const metadataTenantId = tenantIdFromPaystackMetadata(data.metadata);
  if (!reference) {
    await recordDeadLetter(db, rawBody, event, "missing_reference", metadataTenantId);
    return NextResponse.json({ ok: false, error: "missing_reference" }, { status: 422 });
  }

  const result = await applyEvent(db, event as HandledEvent, reference, metadataTenantId);
  if (!result.ok) {
    await recordDeadLetter(db, rawBody, event, result.error, result.tenantId ?? metadataTenantId);
    const status = result.error === "tenant_mismatch" ? 409 : 404;
    return NextResponse.json({ ok: false, error: result.error }, { status });
  }

  return NextResponse.json({
    ok: true,
    event,
    paymentId: result.paymentId,
    bookingId: result.bookingId,
    tenantId: result.tenantId,
  });
}
