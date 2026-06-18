import { NextResponse } from "next/server";
import {
  createSignedSessionCookieValue,
  SESSION_COOKIE_NAME,
  SESSION_TTL_SECONDS,
  verifySignedSessionCookieValue,
} from "@/app/auth/session-cookie";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const cookie = request.headers.get("cookie") ?? "";
  const sessionCookie = readCookie(cookie, SESSION_COOKIE_NAME);
  const session = sessionCookie ? verifySignedSessionCookieValue(sessionCookie) : null;

  if (!session) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true, phone: session.phone });
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: createSignedSessionCookieValue(session.phone),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
  return response;
}

function readCookie(cookieHeader: string, name: string): string | null {
  for (const cookie of cookieHeader.split(";")) {
    const [rawName, ...rawValue] = cookie.trim().split("=");
    if (rawName === name) {
      return rawValue.join("=") || null;
    }
  }

  return null;
}
