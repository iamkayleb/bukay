import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { prisma } from "@/app/db/prisma";
import { getPaymentProvider } from "@/app/lib/payments";
import { PaymentProviderError } from "@/app/lib/payments/provider";
import { runWithTenantContext } from "@/app/tenancy/tenant-context";

export const dynamic = "force-dynamic";

type PaymentRow = {
  id: string;
  tenantId: string;
  bookingId: string;
  amountCents: number;
  currency: string;
  provider: string | null;
  providerRef: string | null;
  status: string;
};

const paymentDelegate = prisma.payment as unknown as {
  findFirst(args: unknown): Promise<PaymentRow | null>;
  update(args: unknown): Promise<unknown>;
};
const bookingDelegate = prisma.booking as unknown as { update(args: unknown): Promise<unknown> };
type PaymentTenantLookup = Pick<PaymentRow, "id" | "tenantId">;

/** Handles the browser callback after a provider has completed payment. */
export async function GET(req: NextRequest) {
  const reference = req.nextUrl.searchParams.get("reference")?.trim();
  if (!reference || reference.length > 200) {
    return NextResponse.json({ ok: false, error: "reference_required" }, { status: 400 });
  }

  // The callback is public, so this narrow parameterized lookup establishes the
  // tenant context from the opaque provider reference. All model operations
  // after it go through the tenant guard below.
  const lookup = await prisma.$queryRaw<PaymentTenantLookup[]>(
    Prisma.sql`SELECT "id", "tenantId" FROM "Payment" WHERE "providerRef" = ${reference} LIMIT 1`
  );
  const paymentIdentity = lookup[0];
  if (!paymentIdentity) {
    return NextResponse.json({ ok: false, error: "payment_not_found" }, { status: 404 });
  }

  return runWithTenantContext({ tenantId: paymentIdentity.tenantId }, async () => {
    const payment = await paymentDelegate.findFirst({
      where: { id: paymentIdentity.id, tenantId: paymentIdentity.tenantId },
    });
    if (!payment) {
      return NextResponse.json({ ok: false, error: "payment_not_found" }, { status: 404 });
    }
    if (payment.status === "success") {
      return NextResponse.json({ ok: true, bookingId: payment.bookingId, status: "confirmed" });
    }

    const provider = payment.provider ? getPaymentProvider(payment.provider) : null;
    if (!provider) {
      return NextResponse.json(
        { ok: false, error: "payment_provider_unavailable" },
        { status: 409 }
      );
    }

    try {
      const verification = await provider.verify(reference);
      if (
        verification.reference !== reference ||
        verification.amount !== payment.amountCents ||
        verification.currency !== payment.currency
      ) {
        return NextResponse.json(
          { ok: false, error: "payment_verification_mismatch" },
          { status: 409 }
        );
      }

      if (verification.status === "pending") {
        return NextResponse.json({ ok: false, status: "pending" }, { status: 202 });
      }

      const successful = verification.status === "success";
      await paymentDelegate.update({
        where: { id: payment.id, tenantId: payment.tenantId },
        data: {
          status: successful ? "success" : "failed",
          paidAt: successful ? verification.paidAt : null,
        },
      });
      await bookingDelegate.update({
        where: { id: payment.bookingId, tenantId: payment.tenantId },
        data: { status: successful ? "confirmed" : "payment_failed" },
      });

      return NextResponse.json({
        ok: successful,
        bookingId: payment.bookingId,
        status: successful ? "confirmed" : "failed",
      });
    } catch (error) {
      if (error instanceof PaymentProviderError) {
        return NextResponse.json(
          { ok: false, error: "payment_verification_unavailable" },
          { status: 502 }
        );
      }
      throw error;
    }
  });
}
