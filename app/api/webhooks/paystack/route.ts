import { NextRequest, NextResponse } from "next/server";

import { handlePaystackWebhook } from "@/app/lib/payments/paystack-webhook";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  return handlePaystackWebhook(request);
}
