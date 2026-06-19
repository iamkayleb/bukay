import { NextRequest, NextResponse } from "next/server";
import {
  readSessionTokenFromCookieHeader,
  verifySession,
  type SessionPayload,
} from "@/app/lib/auth/session";
import { runWithTenantContext } from "@/app/tenancy/tenant-context";

export type AuthenticatedTenantContext = {
  tenantId: string;
  session: SessionPayload;
};

function tenantIdFromSession(session: SessionPayload): string | undefined {
  const claim = (session as SessionPayload & { tenantId?: unknown }).tenantId;
  return typeof claim === "string" && claim.trim().length > 0 ? claim.trim() : undefined;
}

function tenantIdFromHeader(req: NextRequest): string | undefined {
  const header = req.headers.get("x-tenant-id");
  return header && header.trim().length > 0 ? header.trim() : undefined;
}

export async function withSessionTenant(
  req: NextRequest,
  handler: (ctx: AuthenticatedTenantContext) => Promise<NextResponse> | NextResponse
): Promise<NextResponse> {
  const token = readSessionTokenFromCookieHeader(req.headers.get("cookie"));
  const session = token ? verifySession(token) : null;
  if (!session) {
    return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  }

  const tenantId = tenantIdFromSession(session) ?? tenantIdFromHeader(req);
  if (!tenantId) {
    return NextResponse.json({ ok: false, error: "tenant_required" }, { status: 400 });
  }

  return runWithTenantContext({ tenantId }, async () => handler({ tenantId, session }));
}
