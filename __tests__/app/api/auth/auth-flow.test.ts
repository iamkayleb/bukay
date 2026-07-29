import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";

import { POST as login } from "@/app/api/auth/login/route";
import { POST as verify } from "@/app/api/auth/verify/route";
import { POST as logout } from "@/app/api/auth/logout/route";
import { GET as me } from "@/app/api/auth/me/route";

import { MemorySmsProvider } from "@/app/lib/sms/memory";
import { __resetSmsProviderForTests, setSmsProviderForTests } from "@/app/lib/auth/sms";
import {
  OTP_MAX_REQUESTS_PER_WINDOW,
  OTP_RESEND_COOLDOWN_MS,
  OTP_TTL_MS,
  __resetOtpStoreForTests,
  getOtpStore,
} from "@/app/lib/auth/otp";
import { SESSION_COOKIE_NAME, SESSION_TTL_MS, signSession } from "@/app/lib/auth/session";

function jsonRequest(url: string, body: unknown, init?: { cookie?: string }): NextRequest {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (init?.cookie) headers.cookie = init.cookie;
  return new NextRequest(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function extractCode(text: string): string {
  const match = text.match(/(\d{6})/);
  if (!match) throw new Error(`no OTP found in: ${text}`);
  return match[1];
}

function extractSetCookie(res: Response): string | null {
  return res.headers.get("set-cookie");
}

const PHONE_LOCAL = "08031234567";
const PHONE_E164 = "+2348031234567";

let sms: MemorySmsProvider;

beforeEach(() => {
  vi.useRealTimers();
  process.env.SESSION_SECRET = "test-secret-must-be-long-enough";
  __resetOtpStoreForTests();
  __resetSmsProviderForTests();
  sms = new MemorySmsProvider();
  setSmsProviderForTests(sms);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("end-to-end auth flow", () => {
  it("signs up + logs in: phone -> OTP -> session cookie -> /me returns user", async () => {
    const loginRes = await login(jsonRequest("http://test/api/auth/login", { phone: PHONE_LOCAL }));
    expect(loginRes.status).toBe(200);
    const loginBody = await loginRes.json();
    expect(loginBody.ok).toBe(true);
    expect(loginBody.phone).toBe(PHONE_E164);

    const sent = sms.lastTo(PHONE_E164);
    expect(sent).toBeDefined();
    const code = extractCode(sent!.body);

    const verifyRes = await verify(
      jsonRequest("http://test/api/auth/verify", { phone: PHONE_LOCAL, code })
    );
    expect(verifyRes.status).toBe(200);
    const verifyBody = await verifyRes.json();
    expect(verifyBody.ok).toBe(true);
    expect(verifyBody.userId).toBe(`user:${PHONE_E164}`);

    const setCookie = extractSetCookie(verifyRes);
    expect(setCookie).toContain(`${SESSION_COOKIE_NAME}=`);
    expect(setCookie).toContain("HttpOnly");

    const cookieHeader = setCookie!.split(";")[0];
    const meRes = await me(
      new NextRequest("http://test/api/auth/me", { headers: { cookie: cookieHeader } })
    );
    expect(meRes.status).toBe(200);
    const meBody = await meRes.json();
    expect(meBody.userId).toBe(`user:${PHONE_E164}`);
    expect(meBody.phone).toBe(PHONE_E164);

    // session persists across "reloads" — second /me call still works
    const me2 = await me(
      new NextRequest("http://test/api/auth/me", { headers: { cookie: cookieHeader } })
    );
    expect(me2.status).toBe(200);
  });

  it("rejects a wrong OTP", async () => {
    await login(jsonRequest("http://test/api/auth/login", { phone: PHONE_LOCAL }));
    const res = await verify(
      jsonRequest("http://test/api/auth/verify", { phone: PHONE_LOCAL, code: "000000" })
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe("mismatch");
  });

  it("rejects an expired OTP with an explicit expiration message", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

    await login(jsonRequest("http://test/api/auth/login", { phone: PHONE_LOCAL }));
    const code = extractCode(sms.lastTo(PHONE_E164)!.body);

    vi.advanceTimersByTime(OTP_TTL_MS + 1);

    const res = await verify(
      jsonRequest("http://test/api/auth/verify", { phone: PHONE_LOCAL, code })
    );
    expect([400, 401]).toContain(res.status);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe("expired");
    expect(body.message).toBe("OTP expired");
  });

  it("rejects a used OTP on second verify", async () => {
    await login(jsonRequest("http://test/api/auth/login", { phone: PHONE_LOCAL }));
    const code = extractCode(sms.lastTo(PHONE_E164)!.body);

    const first = await verify(
      jsonRequest("http://test/api/auth/verify", { phone: PHONE_LOCAL, code })
    );
    expect(first.status).toBe(200);

    const second = await verify(
      jsonRequest("http://test/api/auth/verify", { phone: PHONE_LOCAL, code })
    );
    expect(second.status).toBe(401);
    const body = await second.json();
    expect(body.error).toBe("not_found");
  });

  it("applies resend cooldown between consecutive OTP requests", async () => {
    // First /login is fine; subsequent rapid logins should hit cooldown -> 429
    const first = await login(jsonRequest("http://test/api/auth/login", { phone: PHONE_LOCAL }));
    expect(first.status).toBe(200);

    const second = await login(jsonRequest("http://test/api/auth/login", { phone: PHONE_LOCAL }));
    expect(second.status).toBe(429);
    expect(second.headers.get("retry-after")).toMatch(/^\d+$/);
    const body = await second.json();
    expect(body.error).toBe("cooldown");
  });

  it("rejects OTP requests beyond the configured rate-limit window", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

    for (let i = 0; i < OTP_MAX_REQUESTS_PER_WINDOW; i++) {
      const res = await login(jsonRequest("http://test/api/auth/login", { phone: PHONE_LOCAL }));
      expect(res.status).toBe(200);
      vi.advanceTimersByTime(OTP_RESEND_COOLDOWN_MS + 1);
    }

    const blocked = await login(jsonRequest("http://test/api/auth/login", { phone: PHONE_LOCAL }));
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toMatch(/^\d+$/);
    const body = await blocked.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe("rate_limited");
    expect(body.message).toBe("rate limit exceeded");
  });

  it("rejects an invalid phone number", async () => {
    const res = await login(jsonRequest("http://test/api/auth/login", { phone: "not-a-phone" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_phone");
  });

  it("logout clears the session cookie", async () => {
    const res = await logout();
    expect(res.status).toBe(200);
    const sc = extractSetCookie(res);
    expect(sc).toContain(`${SESSION_COOKIE_NAME}=`);
    expect(sc).toContain("Max-Age=0");
  });

  it("/me returns 401 with no cookie", async () => {
    const res = await me(new NextRequest("http://test/api/auth/me"));
    expect(res.status).toBe(401);
  });

  it("rejects an expired session cookie with an explicit expiration message", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const now = Date.now();
    const token = signSession({
      sub: `user:${PHONE_E164}`,
      phone: PHONE_E164,
      iat: now - SESSION_TTL_MS,
      exp: now - 1,
    });

    const res = await me(
      new NextRequest("http://test/api/auth/me", {
        headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` },
      })
    );

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe("session_expired");
    expect(body.message).toBe("session expired");
  });

  it("rejects a tampered session cookie with an explicit invalid-session message", async () => {
    const now = Date.now();
    const token = signSession({
      sub: `user:${PHONE_E164}`,
      phone: PHONE_E164,
      iat: now,
      exp: now + SESSION_TTL_MS,
    });
    const tampered = `${token.slice(0, -1)}${token.endsWith("a") ? "b" : "a"}`;

    const res = await me(
      new NextRequest("http://test/api/auth/me", {
        headers: { cookie: `${SESSION_COOKIE_NAME}=${tampered}` },
      })
    );

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe("session_invalid");
    expect(body.message).toBe("session invalid");
  });

  it("normalizes 234-prefixed phone the same as 0-prefixed", async () => {
    await login(jsonRequest("http://test/api/auth/login", { phone: "2348099887766" }));
    // singleton store sees +2348099887766
    const store = getOtpStore();
    // can't directly read codes, but we know an SMS went out
    expect(sms.lastTo("+2348099887766")).toBeDefined();
    expect(store).toBeDefined();
  });
});
