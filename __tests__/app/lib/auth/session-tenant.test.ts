import { afterEach, expect, it, vi } from "vitest";
import { sessionFromCookies, signSession } from "@/app/lib/auth/session";
import { resolveTenant } from "@/app/lib/resolve-tenant";
afterEach(() => {
  vi.unstubAllEnvs();
});
it("resolves cookies before headers, falls back without cookies, and rejects tampering", () => {
  vi.stubEnv("SESSION_SECRET", "test-secret-at-least-sixteen");
  const token = signSession({
    sub: "owner",
    phone: "+2348061778668",
    tenantId: "own",
    iat: Date.now(),
    exp: Date.now() + 60000,
  });
  const resolve = (cookie: string | null, header: string | null) =>
    resolveTenant({ session: sessionFromCookies(cookie), headers: { get: () => header } });
  expect(resolve("bukay_session=" + token, "other")).toEqual({
    tenantId: "own",
    tenantSlug: undefined,
    source: "session",
  });
  expect(resolve(null, "other")).toEqual({ tenantId: "other", source: "header" });
  expect(resolve("bukay_session=x" + token, null)).toEqual({ source: "none" });
});
