/**
 * Flutterwave webhook HTTP entrypoint.
 *
 * Intentionally thin: all verification, durable idempotency, status transitions,
 * and dead-letter handling live in `@/app/lib/payments/flutterwave-webhook` so this
 * module stays small enough for route-type validation and LLM/code review.
 * Export only Next.js route symbols from this file (no test hooks).
 */
import { NextRequest, NextResponse } from "next/server";

import { handleFlutterwaveWebhook } from "@/app/lib/payments/flutterwave-webhook";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  return handleFlutterwaveWebhook(request);
}
