import { timingSafeEqual } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { recordPaymentSuccess } from "@/app/lib/ledger";
import { flutterwaveAmountToCents } from "@/app/lib/payments/flutterwave";

export const runtime = "nodejs";

const completedChargeSchema = z.object({
  event: z.literal("charge.completed"),
  data: z.object({
    tx_ref: z.string().trim().min(1),
    status: z.string(),
    amount: z.union([z.number(), z.string()]),
    currency: z.string().trim().min(1),
    created_at: z.string().datetime().optional(),
    meta: z.record(z.unknown()).optional(),
  }),
});

/** Uses a constant-time comparison for Flutterwave's configured webhook hash. */
export function hasValidFlutterwaveSignature(receivedHash: string | null, secretHash: string) {
  if (!receivedHash || !secretHash) return false;

  const received = Buffer.from(receivedHash);
  const expected = Buffer.from(secretHash);
  return received.length === expected.length && timingSafeEqual(received, expected);
}

function tenantIdFromMetadata(metadata: Record<string, unknown> | undefined) {
  const tenantId = metadata?.tenantId;
  return typeof tenantId === "string" && tenantId.trim() ? tenantId.trim() : null;
}

/** Records a verified Flutterwave payment without trusting an unsigned request body. */
export async function POST(request: NextRequest) {
  const secretHash = process.env.FLUTTERWAVE_WEBHOOK_HASH ?? "";
  if (!hasValidFlutterwaveSignature(request.headers.get("verif-hash"), secretHash)) {
    return NextResponse.json({ error: "INVALID_SIGNATURE" }, { status: 401 });
  }

  const parsed = completedChargeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_WEBHOOK" }, { status: 400 });
  }

  if (parsed.data.data.status !== "successful") {
    return NextResponse.json({ received: true });
  }

  const tenantId = tenantIdFromMetadata(parsed.data.data.meta);
  let amountKobo: number;
  try {
    amountKobo = flutterwaveAmountToCents(parsed.data.data.amount, parsed.data.data.currency);
  } catch {
    return NextResponse.json({ error: "INVALID_WEBHOOK" }, { status: 400 });
  }
  if (!tenantId || !Number.isSafeInteger(amountKobo) || amountKobo < 0) {
    return NextResponse.json({ error: "INVALID_WEBHOOK" }, { status: 400 });
  }

  await recordPaymentSuccess({
    tenantId,
    amountKobo,
    currency: parsed.data.data.currency,
    provider: "flutterwave",
    providerReference: parsed.data.data.tx_ref,
    ...(parsed.data.data.created_at ? { paidAt: new Date(parsed.data.data.created_at) } : {}),
  });

  return NextResponse.json({ received: true });
}
