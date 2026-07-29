import { afterEach, describe, it, expect, vi } from "vitest";
import {
  OTP_MAX_REQUESTS_PER_WINDOW,
  OTP_MAX_VERIFY_ATTEMPTS,
  OTP_RESEND_COOLDOWN_MS,
  OTP_TTL_MS,
  MemoryOtpStateStore,
  OtpStore,
  getOtpSecret,
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

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("OtpStore", () => {
  function store(clock = new FakeClock(), state = new MemoryOtpStateStore()) {
    return new OtpStore(clock, state);
  }

  it("issues a 6-digit code and verifies it once", async () => {
    const clock = new FakeClock();
    const otpStore = store(clock);

    const issued = await otpStore.issue(PHONE);
    if (!issued.ok) throw new Error("expected ok");
    expect(issued.code).toMatch(/^\d{6}$/);
    expect(issued.expiresAt).toBe(clock.now() + OTP_TTL_MS);

    expect((await otpStore.verify(PHONE, issued.code)).ok).toBe(true);
    expect(await otpStore.verify(PHONE, issued.code)).toEqual({ ok: false, reason: "used" });
  });

  it("rejects a mismatched code", async () => {
    const otpStore = store();
    await otpStore.issue(PHONE);
    const r = await otpStore.verify(PHONE, "000000");
    expect(r).toEqual({ ok: false, reason: "mismatch" });
  });

  it("binds OTP verification to the configured OTP_SECRET", async () => {
    vi.stubEnv("OTP_SECRET", "first-test-otp-secret");
    const otpStore = store();
    const issued = await otpStore.issue(PHONE);
    if (!issued.ok) throw new Error("expected ok");

    vi.stubEnv("OTP_SECRET", "second-test-otp-secret");
    expect(await otpStore.verify(PHONE, issued.code)).toEqual({ ok: false, reason: "mismatch" });
  });

  it("rejects an expired code after 5 minutes", async () => {
    const clock = new FakeClock();
    const otpStore = store(clock);
    const issued = await otpStore.issue(PHONE);
    if (!issued.ok) throw new Error("expected ok");
    clock.advance(OTP_TTL_MS + 1);
    expect(await otpStore.verify(PHONE, issued.code)).toEqual({ ok: false, reason: "expired" });
  });

  it("locks out after too many verify attempts", async () => {
    const otpStore = store();
    await otpStore.issue(PHONE);
    for (let i = 0; i < OTP_MAX_VERIFY_ATTEMPTS; i++) {
      expect((await otpStore.verify(PHONE, "000000")).ok).toBe(false);
    }
    expect(await otpStore.verify(PHONE, "000000")).toEqual({
      ok: false,
      reason: "too_many_attempts",
    });
  });

  it("enforces resend cooldown between consecutive issue calls", async () => {
    const clock = new FakeClock();
    const otpStore = store(clock);
    expect((await otpStore.issue(PHONE)).ok).toBe(true);
    const second = await otpStore.issue(PHONE);
    expect(second.ok).toBe(false);
    if (second.ok) throw new Error("unreachable");
    expect(second.reason).toBe("cooldown");
  });

  it("allows reissue after cooldown elapses", async () => {
    const clock = new FakeClock();
    const otpStore = store(clock);
    expect((await otpStore.issue(PHONE)).ok).toBe(true);
    clock.advance(OTP_RESEND_COOLDOWN_MS + 1);
    expect((await otpStore.issue(PHONE)).ok).toBe(true);
  });

  it("rate-limits issue calls within the window", async () => {
    const clock = new FakeClock();
    const otpStore = store(clock);

    for (let i = 0; i < OTP_MAX_REQUESTS_PER_WINDOW; i++) {
      const r = await otpStore.issue(PHONE);
      expect(r.ok).toBe(true);
      clock.advance(OTP_RESEND_COOLDOWN_MS + 1);
    }
    const blocked = await otpStore.issue(PHONE);
    expect(blocked.ok).toBe(false);
    if (blocked.ok) throw new Error("unreachable");
    expect(blocked.reason).toBe("rate_limited");
  });

  it("isolates rate limit by phone number", async () => {
    const clock = new FakeClock();
    const otpStore = store(clock);
    expect((await otpStore.issue(PHONE)).ok).toBe(true);
    expect((await otpStore.issue("+2348099999999")).ok).toBe(true);
  });

  it("shares OTP codes and rate limits across store instances using the same state store", async () => {
    const clock = new FakeClock();
    const state = new MemoryOtpStateStore();
    const instanceA = store(clock, state);
    const instanceB = store(clock, state);

    const issued = await instanceA.issue(PHONE);
    if (!issued.ok) throw new Error("expected ok");

    expect(await instanceB.verify(PHONE, issued.code)).toEqual({ ok: true });
    expect(await instanceA.verify(PHONE, issued.code)).toEqual({ ok: false, reason: "used" });
  });

  it("persists rate-limit counters across store instances using the same state store", async () => {
    const clock = new FakeClock();
    const state = new MemoryOtpStateStore();

    for (let i = 0; i < OTP_MAX_REQUESTS_PER_WINDOW; i++) {
      const issued = await store(clock, state).issue(PHONE);
      expect(issued.ok).toBe(true);
      clock.advance(OTP_RESEND_COOLDOWN_MS + 1);
    }

    const blocked = await store(clock, state).issue(PHONE);
    expect(blocked.ok).toBe(false);
    if (blocked.ok) throw new Error("unreachable");
    expect(blocked.reason).toBe("rate_limited");
  });
});

describe("OTP_SECRET configuration", () => {
  it("fails OTP signing in production when OTP_SECRET is missing", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("OTP_SECRET", "");

    expect(() => getOtpSecret()).toThrow("OTP_SECRET must be set in production to sign OTP codes");
  });

  it("allows module startup in production when OTP_SECRET is set", async () => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("OTP_SECRET", "production-test-otp-secret");

    await expect(import("@/app/lib/auth/otp")).resolves.toHaveProperty("OtpStore");
  });
});
