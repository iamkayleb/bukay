import { NextRequest, NextResponse } from "next/server";
import { InvalidPhoneNumberError, normalizeNigerianPhone } from "@/app/lib/auth/phone";
import { getOtpStore } from "@/app/lib/auth/otp";
import {
  SESSION_TTL_MS,
  buildSessionCookie,
  signSession,
} from "@/app/lib/auth/session";

export const dynamic = "force-dynamic";

function userIdFor(phone: string): string {
  return `user:${phone}`;
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const phoneInput = (body as { phone?: unknown } | null)?.phone;
  const codeInput = (body as { code?: unknown } | null)?.code;
  if (typeof phoneInput !== "string" || typeof codeInput !== "string") {
    return NextResponse.json({ ok: false, error: "phone_and_code_required" }, { status: 400 });
  }

  let phone: string;
  try {
    phone = normalizeNigerianPhone(phoneInput);
  } catch (err) {
    if (err instanceof InvalidPhoneNumberError) {
      return NextResponse.json({ ok: false, error: "invalid_phone" }, { status: 400 });
    }
    throw err;
  }

  const code = codeInput.trim();
  if (!/^\d{6}$/.test(code)) {
    return NextResponse.json({ ok: false, error: "invalid_code_format" }, { status: 400 });
  }

  const result = getOtpStore().verify(phone, code);
  if (!result.ok) {
    const status = result.reason === "mismatch" || result.reason === "not_found" ? 401 : 410;
    return NextResponse.json({ ok: false, error: result.reason }, { status });
  }

  const now = Date.now();
  const payload = { sub: userIdFor(phone), phone, iat: now, exp: now + SESSION_TTL_MS };
  const token = signSession(payload);
  const cookie = buildSessionCookie(token);

  const res = NextResponse.json({ ok: true, phone, userId: payload.sub, expiresAt: payload.exp });
  res.headers.append("Set-Cookie", cookie);
  return res;
}
