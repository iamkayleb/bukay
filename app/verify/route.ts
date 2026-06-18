import { NextResponse } from "next/server";
import { PhoneNumberError } from "@/app/auth/phone-number";
import { PhoneAuthError, verifyLoginOtp } from "@/app/auth/phone-auth";
import {
  createSignedSessionCookieValue,
  SESSION_COOKIE_NAME,
  SESSION_TTL_SECONDS,
} from "@/app/auth/session-cookie";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }

  const payload = body && typeof body === "object" ? (body as Record<string, unknown>) : {};

  try {
    const { phone } = verifyLoginOtp(payload.phone, payload.code);
    const response = NextResponse.json({ ok: true, phone });
    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: createSignedSessionCookieValue(phone),
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: SESSION_TTL_SECONDS,
    });
    return response;
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
