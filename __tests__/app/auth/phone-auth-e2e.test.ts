import { afterEach, describe, expect, it, vi } from "vitest";
import { POST as login } from "@/app/login/route";
import { POST as verify } from "@/app/verify/route";
import { POST as logout } from "@/app/logout/route";
import { GET as session } from "@/app/session/route";
import {
  resetPhoneAuthStateForTests,
  setPhoneAuthDependenciesForTests,
} from "@/app/auth/phone-auth";
import { SESSION_COOKIE_NAME } from "@/app/auth/session-cookie";

function jsonRequest(path: string, body: unknown, cookie?: string): Request {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (cookie) {
    headers.set("Cookie", cookie);
  }

  return new Request(`https://bukay.test${path}`, {
    method: "POST",
    body: JSON.stringify(body),
    headers,
  });
}

function getRequest(path: string, cookie?: string): Request {
  const headers = new Headers();
  if (cookie) {
    headers.set("Cookie", cookie);
  }

  return new Request(`https://bukay.test${path}`, { method: "GET", headers });
}

function cookiePairFrom(response: Response): string {
  const setCookie = response.headers.get("set-cookie");
  expect(setCookie).toContain(`${SESSION_COOKIE_NAME}=`);
  return setCookie?.split(";")[0] ?? "";
}

describe("phone auth e2e flow", () => {
  afterEach(() => {
    resetPhoneAuthStateForTests();
  });

  it("signs up by phone OTP, persists the session across reloads, and logs out", async () => {
    const sendSms = vi.fn().mockResolvedValue({ provider: "test" });
    setPhoneAuthDependenciesForTests({
      smsProvider: { sendSms },
      generateOtp: () => "123456",
      now: () => new Date("2026-06-18T12:00:00.000Z"),
    });

    const loginResponse = await login(jsonRequest("/login", { phone: "08012345678" }));

    expect(loginResponse.status).toBe(200);
    await expect(loginResponse.json()).resolves.toMatchObject({
      ok: true,
      phone: "+2348012345678",
    });
    expect(sendSms).toHaveBeenCalledWith({
      to: "+2348012345678",
      body: "Your Bukay verification code is 123456. It expires in 5 minutes.",
    });

    const verifyResponse = await verify(
      jsonRequest("/verify", { phone: "08012345678", code: "123456" })
    );
    expect(verifyResponse.status).toBe(200);
    await expect(verifyResponse.json()).resolves.toEqual({ ok: true, phone: "+2348012345678" });

    const sessionCookie = cookiePairFrom(verifyResponse);
    const reloadResponse = await session(getRequest("/session", sessionCookie));

    expect(reloadResponse.status).toBe(200);
    await expect(reloadResponse.json()).resolves.toEqual({ ok: true, phone: "+2348012345678" });
    expect(reloadResponse.headers.get("set-cookie")).toContain(`${SESSION_COOKIE_NAME}=`);
    expect(reloadResponse.headers.get("set-cookie")).toContain("HttpOnly");

    const logoutResponse = await logout();

    expect(logoutResponse.status).toBe(200);
    await expect(logoutResponse.json()).resolves.toEqual({ ok: true });
    expect(logoutResponse.headers.get("set-cookie")).toContain(`${SESSION_COOKIE_NAME}=;`);
    expect(logoutResponse.headers.get("set-cookie")).toContain("Max-Age=0");

    const loggedOutResponse = await session(getRequest("/session"));
    expect(loggedOutResponse.status).toBe(401);
    await expect(loggedOutResponse.json()).resolves.toEqual({ ok: false });
  });
});
