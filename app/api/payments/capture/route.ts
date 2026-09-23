import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/app/db/prisma";
import { writeBalanceRecord } from "@/app/lib/payments/split";

const captureRequestSchema = z.object({
  tenantId: z.string().trim().min(1),
  bookingId: z.string().trim().min(1),
  currency: z.string().trim().min(1),
  provider: z.string().trim().min(1),
  providerRef: z.string().trim().min(1),
  priceCents: z.number().int().nonnegative(),
  depositCents: z.number().int().nonnegative(),
  paidAt: z.string().datetime().optional(),
});

type CaptureTransaction = {
  payment: {
    create: Parameters<typeof writeBalanceRecord>[0]["payment"]["create"];
  };
  booking: {
    update(args: { where: { id: string }; data: { status: string } }): Promise<unknown>;
  };
};

const runTransaction = prisma.$transaction as unknown as <T>(
  callback: (transaction: CaptureTransaction) => Promise<T>
) => Promise<T>;

/** Records a verified final payment and closes its booking. */
export async function POST(request: NextRequest) {
  const body: unknown = await request.json().catch(() => null);
  const parsed = captureRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_CAPTURE_REQUEST" }, { status: 400 });
  }

  const paidAt = parsed.data.paidAt ? new Date(parsed.data.paidAt) : undefined;
  try {
    const capture = await runTransaction(async (transaction) => {
      const balance = await writeBalanceRecord(transaction, { ...parsed.data, paidAt });
      await transaction.booking.update({
        where: { id: parsed.data.bookingId },
        data: { status: "closed" },
      });
      return balance;
    });

    return NextResponse.json({ ok: true, capture }, { status: 200 });
  } catch (error) {
    if (error instanceof Error && error.message === "Booking has no outstanding balance") {
      return NextResponse.json({ error: "NO_OUTSTANDING_BALANCE" }, { status: 409 });
    }
    throw error;
  }
}
