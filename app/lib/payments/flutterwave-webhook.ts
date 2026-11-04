import { PrismaClient } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

import { claimIdempotencyKey, type IdempotencyClaimer } from "@/app/lib/idempotency";
import { purgeExpiredDeadLetters } from "@/app/lib/payments/dead-letter";
import { verifyFlutterwaveSignature } from "@/app/lib/payments/signature";

/**
 * Canonical events we apply to Payment / Booking rows.
 * Flutterwave sends `charge.completed` with a data.status of successful|failed;
 * we also accept Paystack-shaped names so contract tests can share fixtures.
 */
export type HandledEvent = "charge.success" | "charge.failed" | "refund.processed";

const HANDLED_EVENTS: ReadonlySet<string> = new Set([
  "charge.success",
  "charge.failed",
  "refund.processed",
  "charge.completed",
]);

type FlutterwaveWebhookPayload = {
  event?: string;
  data?: {
    id?: number | string;
    tx_ref?: string;
    reference?: string;
    status?: string;
    amount?: number;
    currency?: string;
    meta?: Record<string, unknown> | string | null;
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

export type FlutterwaveWebhookDb = {
  payment: {
    findFirst(args: {
      where: { providerRef: string; tenantId?: string };
    }): Promise<PaymentRow | null>;
    update(args: {
      where: { id: string; tenantId: string };
      data: { status: string; paidAt?: Date | null; provider?: string };
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

export type FlutterwaveWebhookDeps = {
  db?: FlutterwaveWebhookDb;
  idempotency?: IdempotencyClaimer;
  secretHash?: string;
};

const globalForDb = globalThis as unknown as { flutterwaveWebhookDb?: PrismaClient };

function defaultDb(): FlutterwaveWebhookDb {
  if (!globalForDb.flutterwaveWebhookDb) {
    globalForDb.flutterwaveWebhookDb = new PrismaClient();
  }
  return globalForDb.flutterwaveWebhookDb as unknown as FlutterwaveWebhookDb;
}

/** Test-only: swap the default Prisma client. Not exported from the route module. */
export function __setFlutterwaveWebhookDbForTests(db: FlutterwaveWebhookDb | null): void {
  globalForDb.flutterwaveWebhookDb = (db as unknown as PrismaClient | undefined) ?? undefined;
}

function eventIdempotencyKey(event: string, data: FlutterwaveWebhookPayload["data"]): string {
  const id = data?.id != null ? String(data.id) : "";
  const reference =
    (typeof data?.tx_ref === "string" && data.tx_ref) ||
    (typeof data?.reference === "string" && data.reference) ||
    "";
  return `flutterwave:${event}:${id || reference || "unknown"}`;
}

/** Best-effort tenant id from Flutterwave meta / metadata. */
export function tenantIdFromFlutterwaveMeta(
  meta: FlutterwaveWebhookPayload["data"] extends { meta?: infer M } ? M : unknown
): string | null {
  if (meta == null) return null;
  let parsed: unknown = meta;
  if (typeof meta === "string") {
    try {
      parsed = JSON.parse(meta);
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

/**
 * Map Flutterwave's `charge.completed` + data.status onto the shared handled events.
 */
export function normalizeFlutterwaveEvent(
  event: string,
  dataStatus: string | undefined
): HandledEvent | null {
  const normalized = event.trim().toLowerCase();
  if (
    normalized === "charge.success" ||
    normalized === "charge.failed" ||
    normalized === "refund.processed"
  ) {
    return normalized as HandledEvent;
  }
  if (normalized === "charge.completed") {
    const status = (dataStatus ?? "").toLowerCase();
    if (status === "successful" || status === "success") return "charge.success";
    if (status === "failed" || status === "cancelled" || status === "canceled") {
      return "charge.failed";
    }
    return null;
  }
  return null;
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
  db: FlutterwaveWebhookDb,
  event: HandledEvent,
  reference: string,
  metadataTenantId: string | null
): Promise<
  | { ok: true; paymentId: string; bookingId: string; tenantId: string }
  | { ok: false; error: string; tenantId?: string | null }
> {
  const payment = await db.payment.findFirst({ where: { providerRef: reference } });
  if (!payment) {
    return { ok: false, error: "payment_not_found", tenantId: metadataTenantId };
  }

  if (metadataTenantId && metadataTenantId !== payment.tenantId) {
    return { ok: false, error: "tenant_mismatch", tenantId: payment.tenantId };
  }

  const paymentStatus = paymentStatusFor(event);
  const bookingStatus = bookingStatusFor(event);
  const paymentData: { status: string; paidAt?: Date | null; provider?: string } = {
    status: paymentStatus,
    provider: "flutterwave",
  };
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
  db: FlutterwaveWebhookDb,
  rawBody: string,
  eventType: string,
  reason: string,
  tenantId?: string | null
): Promise<void> {
  await db.deadLetter.create({
    data: {
      tenantId: tenantId ?? null,
      source: "flutterwave",
      eventType,
      payload: rawBody,
      reason,
    },
  });
}

/**
 * Flutterwave webhook handler: verif-hash → durable idempotency claim → apply
 * charge success / failure / refund (or dead-letter unknowns).
 */
export async function handleFlutterwaveWebhook(
  request: NextRequest | Request,
  deps: FlutterwaveWebhookDeps = {}
): Promise<NextResponse> {
  const rawBody = await request.text();
  const signature =
    request.headers.get("verif-hash") ??
    request.headers.get("Verif-Hash") ??
    request.headers.get("verif_hash");

  if (!verifyFlutterwaveSignature(rawBody, signature, deps.secretHash)) {
    return NextResponse.json({ ok: false, error: "invalid_signature" }, { status: 401 });
  }

  let payload: FlutterwaveWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as FlutterwaveWebhookPayload;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const event = typeof payload.event === "string" ? payload.event : "";
  const data = payload.data ?? {};
  const db = deps.db ?? defaultDb();

  await purgeExpiredDeadLetters(db);

  const key = eventIdempotencyKey(event, data);

  const claimed = deps.idempotency
    ? await Promise.resolve(deps.idempotency.claim(key))
    : await claimIdempotencyKey(db, key);

  if (!claimed) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  const metaTenantId =
    tenantIdFromFlutterwaveMeta(data.meta) ?? tenantIdFromFlutterwaveMeta(data.metadata);

  if (!HANDLED_EVENTS.has(event.trim().toLowerCase())) {
    await recordDeadLetter(db, rawBody, event || "unknown", "unhandled_event", metaTenantId);
    return NextResponse.json({ ok: true, deadLetter: true });
  }

  const handled = normalizeFlutterwaveEvent(
    event,
    typeof data.status === "string" ? data.status : undefined
  );
  if (!handled) {
    await recordDeadLetter(db, rawBody, event || "unknown", "unhandled_status", metaTenantId);
    return NextResponse.json({ ok: true, deadLetter: true });
  }

  const reference =
    (typeof data.tx_ref === "string" && data.tx_ref.trim()) ||
    (typeof data.reference === "string" && data.reference.trim()) ||
    "";
  if (!reference) {
    await recordDeadLetter(db, rawBody, event, "missing_reference", metaTenantId);
    return NextResponse.json({ ok: false, error: "missing_reference" }, { status: 422 });
  }

  const result = await applyEvent(db, handled, reference, metaTenantId);
  if (!result.ok) {
    await recordDeadLetter(db, rawBody, event, result.error, result.tenantId ?? metaTenantId);
    const status = result.error === "tenant_mismatch" ? 409 : 404;
    return NextResponse.json({ ok: false, error: result.error }, { status });
  }

  return NextResponse.json({
    ok: true,
    event: handled,
    paymentId: result.paymentId,
    bookingId: result.bookingId,
    tenantId: result.tenantId,
  });
}
