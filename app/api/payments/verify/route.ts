/**
 * Payment verify HTTP entrypoint (Paystack / Fake redirect callback).
 *
 * Intentionally thin: verification, tenant-scoped payment/booking updates, and
 * slot-hold release live in `@/app/lib/payments/verify-callback` so this module
 * stays small enough for route-type validation and LLM/code review.
 * Export only Next.js route symbols from this file (no test hooks).
 */
import { NextRequest, NextResponse } from "next/server";

import { handlePaymentVerify } from "@/app/lib/payments/verify-callback";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  return handlePaymentVerify(req);
}
