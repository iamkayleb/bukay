import { createHash } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/app/db/prisma";
import { runWithTenantContext } from "@/app/tenancy/tenant-context";
import { verifyFlutterwaveSignature } from "@/app/lib/payments/signature";
import { hasProcessed, markProcessed } from "@/app/lib/idempotency";
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

// charge.completed carries `data.tx_ref`, `data.status` and `data.meta`.
const flutterwaveEventSchema = z
  .object({
    event: z.string().min(1),
    data: z
      .object({
        tx_ref: z.string().min(1).optional(),
        status: z.string().optional(),
        meta: z.record(z.unknown()).nullable().optional(),
      })
      .passthrough(),
  })
  .passthrough();

type FlutterwaveEvent = z.infer<typeof flutterwaveEventSchema>;

// Maps a charge.completed status onto our payment status; other events are
// not handled and go to the dead letter table.
function paymentStatusFor(event: string, status: string | undefined): string | undefined {
  if (event !== "charge.completed") return undefined;
  if (status === "successful") return "success";
  if (status === "failed") return "failed";
  return undefined;
}

function extractTenantId(data: FlutterwaveEvent["data"]): string | undefined {
  const tenantId = data.meta?.tenantId;
  return typeof tenantId === "string" && tenantId.trim() ? tenantId.trim() : undefined;
}

async function recordDeadLetter(event: string, rawBody: string, reason: string): Promise<void> {
  if (!deadLetterDelegate) {
    return;
  }

  await deadLetterDelegate.create({
    data: { provider: "flutterwave", eventType: event, payload: rawBody, reason },
  });
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  if (
    !verifyFlutterwaveSignature(
      rawBody,
      {
        signature: req.headers.get("flutterwave-signature"),
        verifHash: req.headers.get("verif-hash"),
      },
      process.env.FLUTTERWAVE_SECRET_HASH
    )
  ) {
    return NextResponse.json({ ok: false, error: "invalid_signature" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const parsed = flutterwaveEventSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_payload" }, { status: 400 });
  }

  const { event, data } = parsed.data;
  const reference = data.tx_ref?.trim() || undefined;
  const paymentStatus = paymentStatusFor(event, data.status);
  const idempotencyKey = `flutterwave:${event}:${data.status ?? ""}:${reference ?? createHash("sha256").update(rawBody).digest("hex")}`;

  if (hasProcessed(idempotencyKey)) {
    return NextResponse.json({ ok: true, replayed: true });
  }

  if (!paymentStatus) {
    await recordDeadLetter(event, rawBody, "unhandled_event_type");
    markProcessed(idempotencyKey);
    return NextResponse.json({ ok: true, handled: false });
  }

  const tenantId = extractTenantId(data);
  if (!reference || !tenantId) {
    await recordDeadLetter(event, rawBody, "missing_reference_or_tenant");
    markProcessed(idempotencyKey);
    return NextResponse.json({ ok: true, handled: false });
  }

  const succeeded = paymentStatus === "success";
  const handled = await runWithTenantContext({ tenantId }, async () => {
    const payment = await paymentDelegate.findFirst({
      where: { tenantId, providerRef: reference },
    });

    if (!payment) {
      return false;
    }

    await paymentDelegate.update({
      where: { id: payment.id, tenantId },
      data: { status: paymentStatus, paidAt: succeeded ? new Date() : undefined },
    });

    const booking = await bookingDelegate.update({
      where: { id: payment.bookingId, tenantId },
      data: { status: succeeded ? "confirmed" : "payment_failed" },
    });

    if (succeeded) {
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

  markProcessed(idempotencyKey);
  return NextResponse.json({ ok: true, handled });
}
