import { NextRequest, NextResponse } from "next/server";
import {
  SESSION_TTL_MS,
  buildSessionCookie,
  readSessionTokenFromCookieHeader,
  signSession,
  verifySessionDetailed,
} from "@/app/lib/auth/session";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const token = readSessionTokenFromCookieHeader(req.headers.get("cookie"));
  const result = verifySessionDetailed(token);
  if (!result.ok) {
    const message = result.reason === "expired" ? "session expired" : "session invalid";
    return NextResponse.json(
      {
        ok: false,
        error: result.reason === "expired" ? "session_expired" : "session_invalid",
        message,
      },
      { status: 401 }
    );
  }

  const session = result.payload;
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
