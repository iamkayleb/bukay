import { describe, it, expect, beforeEach } from "vitest";
import {
  SESSION_COOKIE_NAME,
  SESSION_TTL_MS,
  buildClearSessionCookie,
  buildSessionCookie,
  readSessionTokenFromCookieHeader,
  signSession,
  verifySession,
} from "@/app/lib/auth/session";

const SECRET = "test-secret-must-be-long-enough";

beforeEach(() => {
  process.env.SESSION_SECRET = SECRET;
});

describe("session signing", () => {
  it("round-trips a payload through sign/verify", () => {
    const now = Date.now();
    const payload = { sub: "user:+2348031234567", phone: "+2348031234567", iat: now, exp: now + SESSION_TTL_MS };
    const token = signSession(payload);
    expect(verifySession(token)).toEqual(payload);
  });

  it("rejects a tampered token", () => {
    const now = Date.now();
    const token = signSession({ sub: "user", phone: "+234803", iat: now, exp: now + 60_000 });
    const tampered = token.slice(0, -2) + "aa";
    expect(verifySession(tampered)).toBeNull();
  });

  it("rejects a token signed with a different secret", () => {
    const now = Date.now();
    const token = signSession({ sub: "u", phone: "+234", iat: now, exp: now + 60_000 }, "another-very-long-secret");
    expect(verifySession(token)).toBeNull();
  });

  it("rejects an expired token", () => {
    const past = Date.now() - 10_000;
    const token = signSession({ sub: "u", phone: "+234", iat: past - 60_000, exp: past });
    expect(verifySession(token)).toBeNull();
  });
});

describe("session cookie helpers", () => {
  it("buildSessionCookie includes HttpOnly + Lax + Path + Max-Age", () => {
    const cookie = buildSessionCookie("tok.value");
    expect(cookie).toContain(`${SESSION_COOKIE_NAME}=tok.value`);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Path=/");
    expect(cookie).toMatch(/Max-Age=\d+/);
  });

  it("buildClearSessionCookie sets Max-Age=0", () => {
    expect(buildClearSessionCookie()).toContain("Max-Age=0");
  });

  it("readSessionTokenFromCookieHeader extracts the session token", () => {
    const header = `other=foo; ${SESSION_COOKIE_NAME}=abc.def; another=bar`;
    expect(readSessionTokenFromCookieHeader(header)).toBe("abc.def");
    expect(readSessionTokenFromCookieHeader(null)).toBeNull();
    expect(readSessionTokenFromCookieHeader("other=foo")).toBeNull();
  });
});
