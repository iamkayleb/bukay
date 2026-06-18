import { NextRequest, NextResponse } from "next/server";
import { InvalidPhoneNumberError, normalizeNigerianPhone } from "@/app/lib/auth/phone";
import { getOtpStore } from "@/app/lib/auth/otp";
import { getSmsProvider } from "@/app/lib/auth/sms";
import { SmsProviderError } from "@/app/lib/sms";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const phoneInput = (body as { phone?: unknown } | null)?.phone;
  if (typeof phoneInput !== "string") {
    return NextResponse.json({ ok: false, error: "phone_required" }, { status: 400 });
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

  const result = getOtpStore().issue(phone);
  if (!result.ok) {
    const retryAfter = Math.max(1, Math.ceil(result.retryAfterMs / 1000));
    return NextResponse.json(
      { ok: false, error: result.reason, retryAfterSeconds: retryAfter },
      { status: 429, headers: { "Retry-After": String(retryAfter) } }
    );
  }

  try {
    await getSmsProvider().send({
      to: phone,
      body: `Your Bukay verification code is ${result.code}. It expires in 5 minutes.`,
    });
  } catch (err) {
    const status = err instanceof SmsProviderError ? 502 : 500;
    return NextResponse.json({ ok: false, error: "sms_send_failed" }, { status });
  }

  return NextResponse.json({ ok: true, phone, expiresAt: result.expiresAt });
}
