import { NextResponse } from "next/server";
import { buildClearSessionCookie } from "@/app/lib/auth/session";
import { withTenantScope } from "@/app/lib/tenant-scope";

export const dynamic = "force-dynamic";

export const POST = withTenantScope(() => {
  const res = NextResponse.json({ ok: true });
  res.headers.append("Set-Cookie", buildClearSessionCookie());
  return res;
});
