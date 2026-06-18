import { afterEach, describe, expect, it, vi } from "vitest";
import { POST as login } from "@/app/login/route";
import { POST as verify } from "@/app/verify/route";
import {
  resetPhoneAuthStateForTests,
  setPhoneAuthDependenciesForTests,
} from "@/app/auth/phone-auth";
import { SESSION_COOKIE_NAME } from "@/app/auth/session-cookie";

function jsonRequest(body: unknown): Request {
  return new Request("https://bukay.test/login", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("phone auth routes", () => {
  afterEach(() => {
    resetPhoneAuthStateForTests();
  });

  it("sends an OTP from POST /login and verifies it through POST /verify", async () => {
    const sendSms = vi.fn().mockResolvedValue({ provider: "test" });
    setPhoneAuthDependenciesForTests({
      smsProvider: { sendSms },
      generateOtp: () => "123456",
      now: () => new Date("2026-06-18T12:00:00.000Z"),
    });

    const loginResponse = await login(jsonRequest({ phone: "08012345678" }));
    expect(loginResponse.status).toBe(200);
    await expect(loginResponse.json()).resolves.toMatchObject({
      ok: true,
      phone: "+2348012345678",
      expiresAt: "2026-06-18T12:05:00.000Z",
    });
    expect(sendSms).toHaveBeenCalledWith({
      to: "+2348012345678",
      body: "Your Bukay verification code is 123456. It expires in 5 minutes.",
    });

    const verifyResponse = await verify(jsonRequest({ phone: "+2348012345678", code: "123456" }));
    expect(verifyResponse.status).toBe(200);
    await expect(verifyResponse.json()).resolves.toEqual({ ok: true, phone: "+2348012345678" });
    expect(verifyResponse.headers.get("set-cookie")).toContain(`${SESSION_COOKIE_NAME}=`);
    expect(verifyResponse.headers.get("set-cookie")).toContain("HttpOnly");
  });

  it("rejects invalid phone numbers before sending SMS", async () => {
    const sendSms = vi.fn().mockResolvedValue({ provider: "test" });
    setPhoneAuthDependenciesForTests({ smsProvider: { sendSms } });

    const response = await login(jsonRequest({ phone: "+14155552671" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Enter a valid Nigerian phone number",
    });
    expect(sendSms).not.toHaveBeenCalled();
  });

  it("rejects used OTPs", async () => {
    setPhoneAuthDependenciesForTests({
      smsProvider: { sendSms: vi.fn().mockResolvedValue({ provider: "test" }) },
      generateOtp: () => "123456",
    });

    await login(jsonRequest({ phone: "08012345678" }));
    expect((await verify(jsonRequest({ phone: "08012345678", code: "123456" }))).status).toBe(200);

    const replayResponse = await verify(jsonRequest({ phone: "08012345678", code: "123456" }));

    expect(replayResponse.status).toBe(401);
    await expect(replayResponse.json()).resolves.toMatchObject({
      code: "invalid_otp",
    });
  });
});
