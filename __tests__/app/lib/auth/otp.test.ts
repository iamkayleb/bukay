import { describe, it, expect } from "vitest";
import {
  OTP_MAX_REQUESTS_PER_WINDOW,
  OTP_MAX_VERIFY_ATTEMPTS,
  OTP_RESEND_COOLDOWN_MS,
  OTP_TTL_MS,
  OtpStore,
} from "@/app/lib/auth/otp";

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

describe("OtpStore", () => {
  it("issues a 6-digit code and verifies it once", () => {
    const clock = new FakeClock();
    const store = new OtpStore(clock);

    const issued = store.issue(PHONE);
    if (!issued.ok) throw new Error("expected ok");
    expect(issued.code).toMatch(/^\d{6}$/);
    expect(issued.expiresAt).toBe(clock.now() + OTP_TTL_MS);

    expect(store.verify(PHONE, issued.code).ok).toBe(true);
    // second use rejected — record was consumed/cleared
    expect(store.verify(PHONE, issued.code).ok).toBe(false);
  });

  it("rejects a mismatched code", () => {
    const store = new OtpStore(new FakeClock());
    store.issue(PHONE);
    const r = store.verify(PHONE, "000000");
    expect(r).toEqual({ ok: false, reason: "mismatch" });
  });

  it("rejects an expired code after 5 minutes", () => {
    const clock = new FakeClock();
    const store = new OtpStore(clock);
    const issued = store.issue(PHONE);
    if (!issued.ok) throw new Error("expected ok");
    clock.advance(OTP_TTL_MS + 1);
    expect(store.verify(PHONE, issued.code)).toEqual({ ok: false, reason: "expired" });
  });

  it("locks out after too many verify attempts", () => {
    const store = new OtpStore(new FakeClock());
    store.issue(PHONE);
    for (let i = 0; i < OTP_MAX_VERIFY_ATTEMPTS; i++) {
      expect(store.verify(PHONE, "000000").ok).toBe(false);
    }
    expect(store.verify(PHONE, "000000")).toEqual({
      ok: false,
      reason: "too_many_attempts",
    });
  });

  it("enforces resend cooldown between consecutive issue calls", () => {
    const clock = new FakeClock();
    const store = new OtpStore(clock);
    expect(store.issue(PHONE).ok).toBe(true);
    const second = store.issue(PHONE);
    expect(second.ok).toBe(false);
    if (second.ok) throw new Error("unreachable");
    expect(second.reason).toBe("cooldown");
  });

  it("allows reissue after cooldown elapses", () => {
    const clock = new FakeClock();
    const store = new OtpStore(clock);
    expect(store.issue(PHONE).ok).toBe(true);
    clock.advance(OTP_RESEND_COOLDOWN_MS + 1);
    expect(store.issue(PHONE).ok).toBe(true);
  });

  it("rate-limits issue calls within the window", () => {
    const clock = new FakeClock();
    const store = new OtpStore(clock);

    for (let i = 0; i < OTP_MAX_REQUESTS_PER_WINDOW; i++) {
      const r = store.issue(PHONE);
      expect(r.ok).toBe(true);
      clock.advance(OTP_RESEND_COOLDOWN_MS + 1);
    }
    const blocked = store.issue(PHONE);
    expect(blocked.ok).toBe(false);
    if (blocked.ok) throw new Error("unreachable");
    expect(blocked.reason).toBe("rate_limited");
  });

  it("isolates rate limit by phone number", () => {
    const clock = new FakeClock();
    const store = new OtpStore(clock);
    expect(store.issue(PHONE).ok).toBe(true);
    expect(store.issue("+2348099999999").ok).toBe(true);
  });
});
