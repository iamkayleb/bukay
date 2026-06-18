import { NextRequest, NextResponse } from "next/server";
import {
  SESSION_TTL_MS,
  buildSessionCookie,
  readSessionTokenFromCookieHeader,
  signSession,
  verifySession,
} from "@/app/lib/auth/session";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const token = readSessionTokenFromCookieHeader(req.headers.get("cookie"));
  const session = token ? verifySession(token) : null;
  if (!session) {
    return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  }

  const now = Date.now();
  const refreshed = signSession({ ...session, iat: now, exp: now + SESSION_TTL_MS });
  const res = NextResponse.json({
    ok: true,
    userId: session.sub,
    phone: session.phone,
    expiresAt: now + SESSION_TTL_MS,
  });
  res.headers.append("Set-Cookie", buildSessionCookie(refreshed));
  return res;
}
