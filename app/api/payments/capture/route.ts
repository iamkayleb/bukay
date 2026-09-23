import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/app/db/prisma";
import { jsonError, readJson, runForTenant, validationError } from "@/app/api/services/_helpers";

export const dynamic = "force-dynamic";

type PaymentRow = {
  id: string;
  tenantId: string;
  bookingId: string;
  kind: string;
  status: string;
};

type BookingRow = {
  id: string;
  tenantId: string;
  status: string;
};

const paymentDelegate = prisma.payment as unknown as {
  findFirst(args: unknown): Promise<PaymentRow | null>;
  update(args: unknown): Promise<PaymentRow>;
};
const bookingDelegate = prisma.booking as unknown as {
  update(args: unknown): Promise<BookingRow>;
};

const captureSchema = z
  .object({
    bookingId: z.string().trim().min(1, "bookingId is required"),
  })
  .strict();

/** Captures the outstanding balance on a deposit-only booking and closes it out. */
export async function POST(req: NextRequest) {
  const body = await readJson(req);
  if (body instanceof NextResponse) {
    return body;
  }

  const parsed = captureSchema.safeParse(body);
  if (!parsed.success) {
    return validationError(parsed.error);
  }

  const { bookingId } = parsed.data;

  return runForTenant(req, async (tenantId) => {
    const balance = await paymentDelegate.findFirst({
      where: { tenantId, bookingId, kind: "balance", status: "pending" },
    });
    if (!balance) {
      return jsonError("balance_not_found", 404);
    }

    await paymentDelegate.update({
      where: { id: balance.id, tenantId },
      data: { status: "success", paidAt: new Date() },
    });

    const booking = await bookingDelegate.update({
      where: { id: bookingId, tenantId },
      data: { status: "confirmed" },
    });

    return NextResponse.json({ ok: true, bookingId: booking.id, status: booking.status });
  });
}
