import { describe, it, expect, beforeEach, vi } from "vitest";
import { otpTable } from "../../../fixtures/fake-otp-prisma";
import {
  OTP_MAX_REQUESTS_PER_WINDOW,
  OTP_MAX_VERIFY_ATTEMPTS,
  OTP_RESEND_COOLDOWN_MS,
  OTP_TTL_MS,
  OtpStore,
} from "@/app/lib/auth/otp";

vi.mock("@/app/db/prisma", async () => ({
  prisma: (await import("../../../fixtures/fake-otp-prisma")).fakePrisma,
}));

class FakeClock {
  constructor(public t = 1_700_000_000_000) {}
  now() {
    return this.t;
  }
  advance(ms: number) {
    this.t += ms;
  }
}

const PHONE = "+2348031234567";

beforeEach(() => otpTable.clear());

describe("OtpStore", () => {
  it("issues a 6-digit code and verifies it once", async () => {
    const clock = new FakeClock();
    const store = new OtpStore(clock);

    const issued = await store.issue(PHONE);
    if (!issued.ok) throw new Error("expected ok");
    expect(issued.code).toMatch(/^\d{6}$/);
    expect(issued.expiresAt).toBe(clock.now() + OTP_TTL_MS);

    expect((await store.verify(PHONE, issued.code)).ok).toBe(true);
    // second use rejected — record was consumed/cleared
    expect((await store.verify(PHONE, issued.code)).ok).toBe(false);
  });

  it("rejects a mismatched code", async () => {
    const store = new OtpStore(new FakeClock());
    await store.issue(PHONE);
    const r = await store.verify(PHONE, "000000");
    expect(r).toEqual({ ok: false, reason: "mismatch" });
  });

  it("rejects an expired code after 5 minutes", async () => {
    const clock = new FakeClock();
    const store = new OtpStore(clock);
    const issued = await store.issue(PHONE);
    if (!issued.ok) throw new Error("expected ok");
    clock.advance(OTP_TTL_MS + 1);
    expect(await store.verify(PHONE, issued.code)).toEqual({ ok: false, reason: "expired" });
  });

  it("locks out after too many verify attempts", async () => {
    const store = new OtpStore(new FakeClock());
    await store.issue(PHONE);
    for (let i = 0; i < OTP_MAX_VERIFY_ATTEMPTS; i++) {
      expect((await store.verify(PHONE, "000000")).ok).toBe(false);
    }
    expect(await store.verify(PHONE, "000000")).toEqual({
      ok: false,
      reason: "too_many_attempts",
    });
  });

  it("enforces resend cooldown between consecutive issue calls", async () => {
    const clock = new FakeClock();
    const store = new OtpStore(clock);
    expect((await store.issue(PHONE)).ok).toBe(true);
    const second = await store.issue(PHONE);
    expect(second.ok).toBe(false);
    if (second.ok) throw new Error("unreachable");
    expect(second.reason).toBe("cooldown");
  });

  it("allows reissue after cooldown elapses", async () => {
    const clock = new FakeClock();
    const store = new OtpStore(clock);
    expect((await store.issue(PHONE)).ok).toBe(true);
    clock.advance(OTP_RESEND_COOLDOWN_MS + 1);
    expect((await store.issue(PHONE)).ok).toBe(true);
  });

  it("rate-limits issue calls within the window", async () => {
    const clock = new FakeClock();
    const store = new OtpStore(clock);

    for (let i = 0; i < OTP_MAX_REQUESTS_PER_WINDOW; i++) {
      const r = await store.issue(PHONE);
      expect(r.ok).toBe(true);
      clock.advance(OTP_RESEND_COOLDOWN_MS + 1);
    }
    const blocked = await store.issue(PHONE);
    expect(blocked.ok).toBe(false);
    if (blocked.ok) throw new Error("unreachable");
    expect(blocked.reason).toBe("rate_limited");
  });

  it("isolates rate limit by phone number", async () => {
    const clock = new FakeClock();
    const store = new OtpStore(clock);
    expect((await store.issue(PHONE)).ok).toBe(true);
    expect((await store.issue("+2348099999999")).ok).toBe(true);
  });

  it("verifies a code in a separate store instance from the one that issued it", async () => {
    const clock = new FakeClock();
    const issued = await new OtpStore(clock).issue(PHONE);
    if (!issued.ok) throw new Error("expected ok");

    expect(otpTable.get(PHONE)?.hash).not.toContain(issued.code);
    expect(await new OtpStore(clock).verify(PHONE, issued.code)).toEqual({ ok: true });
    expect(otpTable.has(PHONE)).toBe(false);
  });

  it("persists the attempt count across instances", async () => {
    const clock = new FakeClock();
    await new OtpStore(clock).issue(PHONE);
    for (let i = 0; i < OTP_MAX_VERIFY_ATTEMPTS; i++) {
      expect((await new OtpStore(clock).verify(PHONE, "000000")).ok).toBe(false);
    }
    expect(await new OtpStore(clock).verify(PHONE, "000000")).toEqual({
      ok: false,
      reason: "too_many_attempts",
    });
    expect(otpTable.has(PHONE)).toBe(false);
  });

  it("rejects and removes an expired stored row in another instance", async () => {
    const clock = new FakeClock();
    const issued = await new OtpStore(clock).issue(PHONE);
    if (!issued.ok) throw new Error("expected ok");
    clock.advance(OTP_TTL_MS + 1);
    expect(await new OtpStore(clock).verify(PHONE, issued.code)).toEqual({
      ok: false,
      reason: "expired",
    });
    expect(otpTable.has(PHONE)).toBe(false);
  });
});
