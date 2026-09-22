import { createHash } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/app/db/prisma";
import { runWithTenantContext } from "@/app/tenancy/tenant-context";
import { verifyPaystackSignature } from "@/app/lib/payments/signature";
import { claimIdempotencyKey } from "@/app/lib/idempotency";
import { emitBookingConfirmed } from "@/app/lib/events";

export const dynamic = "force-dynamic";

type PaymentRecord = {
  id: string;
  tenantId: string;
  bookingId: string;
  status: string;
};

type BookingRecord = {
  id: string;
  tenantId: string;
  staffId: string | null;
  startsAt: Date;
  endsAt: Date;
  status: string;
};

const paymentDelegate = prisma.payment as unknown as {
  findFirst(args: unknown): Promise<PaymentRecord | null>;
  update(args: unknown): Promise<PaymentRecord>;
};

const bookingDelegate = prisma.booking as unknown as {
  update(args: unknown): Promise<BookingRecord>;
};

const deadLetterDelegate = (
  prisma as unknown as { deadLetterEvent?: { create(args: unknown): Promise<unknown> } }
).deadLetterEvent;

// charge.success/charge.failed carry `data.reference` + `data.metadata`.
// refund.processed carries the original transaction (and its metadata)
// nested under `data.transaction`.
const paystackEventSchema = z
  .object({
    event: z.string().min(1),
    data: z
      .object({
        reference: z.string().min(1).optional(),
        metadata: z.record(z.unknown()).nullable().optional(),
        transaction: z
          .object({
            reference: z.string().min(1).optional(),
            metadata: z.record(z.unknown()).nullable().optional(),
          })
          .partial()
          .optional(),
      })
      .passthrough(),
  })
  .passthrough();

type PaystackEvent = z.infer<typeof paystackEventSchema>;

const PAYMENT_STATUS_BY_EVENT: Record<string, string> = {
  "charge.success": "success",
  "charge.failed": "failed",
  "refund.processed": "refunded",
};

const BOOKING_STATUS_BY_EVENT: Record<string, string> = {
  "charge.success": "confirmed",
  "charge.failed": "payment_failed",
  "refund.processed": "refunded",
};

function extractReference(data: PaystackEvent["data"]): string | undefined {
  return data.reference?.trim() || data.transaction?.reference?.trim() || undefined;
}

function extractTenantId(data: PaystackEvent["data"]): string | undefined {
  const metadata = data.metadata ?? data.transaction?.metadata;
  const tenantId = metadata?.tenantId;
  return typeof tenantId === "string" && tenantId.trim() ? tenantId.trim() : undefined;
}

async function recordDeadLetter(event: string, rawBody: string, reason: string): Promise<void> {
  if (!deadLetterDelegate) {
    return;
  }

  await deadLetterDelegate.create({
    data: { provider: "paystack", eventType: event, payload: rawBody, reason },
  });
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-paystack-signature");

  if (!verifyPaystackSignature(rawBody, signature, process.env.PAYSTACK_SECRET_KEY)) {
    return NextResponse.json({ ok: false, error: "invalid_signature" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const parsed = paystackEventSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_payload" }, { status: 400 });
  }

  const { event, data } = parsed.data;
  const reference = extractReference(data);
  const idempotencyKey = `paystack:${event}:${reference ?? createHash("sha256").update(rawBody).digest("hex")}`;

  if (!(await claimIdempotencyKey(idempotencyKey))) {
    return NextResponse.json({ ok: true, replayed: true });
  }

  if (!(event in PAYMENT_STATUS_BY_EVENT)) {
    await recordDeadLetter(event, rawBody, "unhandled_event_type");
    return NextResponse.json({ ok: true, handled: false });
  }

  const tenantId = extractTenantId(data);
  if (!reference || !tenantId) {
    await recordDeadLetter(event, rawBody, "missing_reference_or_tenant");
    return NextResponse.json({ ok: true, handled: false });
  }

  const handled = await runWithTenantContext({ tenantId }, async () => {
    const payment = await paymentDelegate.findFirst({
      where: { tenantId, providerRef: reference },
    });

    if (!payment) {
      return false;
    }

    await paymentDelegate.update({
      where: { id: payment.id, tenantId },
      data: {
        status: PAYMENT_STATUS_BY_EVENT[event],
        paidAt: event === "charge.success" ? new Date() : undefined,
      },
    });

    const booking = await bookingDelegate.update({
      where: { id: payment.bookingId, tenantId },
      data: { status: BOOKING_STATUS_BY_EVENT[event] },
    });

    if (event === "charge.success") {
      emitBookingConfirmed({
        bookingId: booking.id,
        tenantId,
        staffId: booking.staffId,
        startsAt: booking.startsAt,
        endsAt: booking.endsAt,
      });
    }

    return true;
  });

  if (!handled) {
    await recordDeadLetter(event, rawBody, "payment_not_found");
  }

  return NextResponse.json({ ok: true, handled });
}
