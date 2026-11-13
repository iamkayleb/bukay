import { NextRequest, NextResponse } from "next/server";

import { jsonError, runForTenant } from "@/app/api/services/_helpers";
import { prisma } from "@/app/db/prisma";

export const dynamic = "force-dynamic";

/** Status values written by webhooks and verify-callback — not invented here. */
const PAYMENT_STATUSES = new Set(["pending", "paid", "failed", "refunded"]);

export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get("status");
  if (status !== null && !PAYMENT_STATUSES.has(status)) {
    return jsonError("invalid_status", 422);
  }

  return runForTenant(req, async (tenantId) => {
    const payments = await prisma.payment.findMany({
      where: {
        tenantId,
        ...(status ? { status } : {}),
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        amountCents: true,
        currency: true,
        status: true,
        createdAt: true,
        paidAt: true,
        booking: {
          select: {
            client: { select: { name: true } },
            service: { select: { name: true } },
          },
        },
      },
    });

    return NextResponse.json({
      ok: true,
      payments: payments.map((payment) => ({
        ...payment,
        createdAt: payment.createdAt.toISOString(),
        paidAt: payment.paidAt ? payment.paidAt.toISOString() : null,
      })),
    });
  });
}
