/**
 * Payment verify callback handler (Paystack redirect / Fake provider).
 *
 * Extracted from the Next.js route so status transitions, tenant-scoped writes,
 * and slot-hold release stay reviewable without relying on a truncated route diff.
 */
import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/app/db/prisma";
import { getPaymentProvider } from "@/app/lib/payments/resolve-provider";
import { releaseHoldForBooking } from "@/app/lib/slot-hold";
import { runWithTenantContext } from "@/app/tenancy/tenant-context";

export async function handlePaymentVerify(req: NextRequest): Promise<NextResponse> {
  const reference = req.nextUrl.searchParams.get("reference")?.trim();
  const tenantId = req.nextUrl.searchParams.get("tenantId")?.trim();

  if (!reference) {
    return NextResponse.json({ ok: false, error: "reference_required" }, { status: 400 });
  }
  if (!tenantId) {
    return NextResponse.json({ ok: false, error: "tenant_id_required" }, { status: 400 });
  }

  const provider = getPaymentProvider();

  let verified;
  try {
    verified = await provider.verify({ reference });
  } catch {
    return NextResponse.json({ ok: false, error: "verification_failed" }, { status: 502 });
  }

  return runWithTenantContext({ tenantId }, async () => {
    const payment = await prisma.payment.findFirst({
      where: { tenantId, providerRef: reference },
      include: {
        booking: {
          select: {
            id: true,
            status: true,
            serviceId: true,
            startsAt: true,
          },
        },
      },
    });

    if (!payment) {
      return NextResponse.json({ ok: false, error: "payment_not_found" }, { status: 404 });
    }

    if (verified.status === "success") {
      const paidAt = verified.paidAt ?? new Date();
      await prisma.$transaction(async (tx) => {
        await tx.payment.updateMany({
          where: { tenantId, id: payment.id },
          data: {
            status: "paid",
            provider: verified.provider,
            providerRef: verified.reference,
            paidAt,
          },
        });
        await tx.booking.updateMany({
          where: { tenantId, id: payment.bookingId },
          data: { status: "confirmed" },
        });
        // Confirmed booking owns the slot via Booking.slotLock; drop the hold.
        await releaseHoldForBooking(tx, tenantId, payment.bookingId);
      });

      return NextResponse.json({
        ok: true,
        status: "confirmed",
        bookingId: payment.bookingId,
        paymentId: payment.id,
        reference: verified.reference,
        platformSplitPercentage: verified.platformSplitPercentage ?? null,
      });
    }

    // Failed / abandoned / pending-but-treated-as-failed on explicit fail status.
    if (verified.status === "failed" || verified.status === "abandoned") {
      await prisma.$transaction(async (tx) => {
        await tx.payment.updateMany({
          where: { tenantId, id: payment.id },
          data: {
            status: "failed",
            provider: verified.provider,
            providerRef: verified.reference,
            paidAt: null,
          },
        });
        await tx.booking.updateMany({
          where: { tenantId, id: payment.bookingId, status: "pending_payment" },
          data: { status: "cancelled", slotLock: null },
        });
        await releaseHoldForBooking(tx, tenantId, payment.bookingId);
      });

      return NextResponse.json({
        ok: true,
        status: "failed",
        bookingId: payment.bookingId,
        paymentId: payment.id,
        reference: verified.reference,
        slotReleased: true,
      });
    }

    return NextResponse.json({
      ok: true,
      status: "pending",
      bookingId: payment.bookingId,
      paymentId: payment.id,
      reference: verified.reference,
    });
  });
}
