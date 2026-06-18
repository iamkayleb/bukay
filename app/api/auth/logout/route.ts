import { NextResponse } from "next/server";
import { buildClearSessionCookie } from "@/app/lib/auth/session";

export const dynamic = "force-dynamic";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.headers.append("Set-Cookie", buildClearSessionCookie());
  return res;
}
