import { SESSION_COOKIE_NAME, signSession } from "@/app/lib/auth/session";

/** Shared secret for signed session cookies in integration-style API tests. */
export const TEST_SESSION_SECRET = "test-secret-at-least-sixteen";

export function tenantSessionCookie(tenantId: string): string {
  const now = Date.now();
  const token = signSession(
    {
      sub: "test-owner",
      phone: "+2348000000000",
      tenantId,
      iat: now,
      exp: now + 60 * 60 * 1000,
    },
    TEST_SESSION_SECRET
  );
  return `${SESSION_COOKIE_NAME}=${token}`;
}

export function tenantRequestHeaders(
  tenantId: string,
  extra: Record<string, string> = {}
): Record<string, string> {
  return {
    cookie: tenantSessionCookie(tenantId),
    ...extra,
  };
}