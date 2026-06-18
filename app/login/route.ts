import { NextResponse } from "next/server";
import { PhoneNumberError } from "@/app/auth/phone-number";
import { PhoneAuthError, requestLoginOtp } from "@/app/auth/phone-auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }

  const phone =
    body && typeof body === "object" ? (body as Record<string, unknown>).phone : undefined;

  try {
    const result = await requestLoginOtp(phone);
    return NextResponse.json({ ok: true, phone: result.phone, expiresAt: result.expiresAt });
  } catch (error) {
    if (error instanceof PhoneNumberError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (error instanceof PhoneAuthError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }

    throw error;
  }
}
