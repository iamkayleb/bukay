/**
 * WhatsApp Cloud API webhook.
 *
 * GET completes Meta's subscription handshake. POST receives inbound messages,
 * routes them by the business number, and records the conversation. Signature
 * checks and persistence live in `@/app/lib/whatsapp/inbound`.
 */
import { NextRequest, NextResponse } from "next/server";

import { handleWhatsAppInbound, verifyWhatsAppSubscription } from "@/app/lib/whatsapp/inbound";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  return verifyWhatsAppSubscription(request);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return handleWhatsAppInbound(request);
}
