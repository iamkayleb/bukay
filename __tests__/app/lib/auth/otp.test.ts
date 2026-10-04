import { execFileSync } from "node:child_process";
import path from "node:path";

import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/app/db/prisma";
import {
  OTP_MAX_REQUESTS_PER_WINDOW,
  OTP_MAX_VERIFY_ATTEMPTS,
  OTP_RESEND_COOLDOWN_MS,
  OTP_TTL_MS,
  MemoryOtpCodeDb,
  OtpStore,
  prismaOtpCodeDb,
  type Clock,
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

function memoryStore(clock: Clock = new FakeClock()) {
  return new OtpStore(clock, new MemoryOtpCodeDb());
}

describe("OtpStore", () => {
  it("issues a 6-digit code and verifies it once", async () => {
    const clock = new FakeClock();
    const store = memoryStore(clock);

    const issued = await store.issue(PHONE);
    if (!issued.ok) throw new Error("expected ok");
    expect(issued.code).toMatch(/^\d{6}$/);
    expect(issued.expiresAt).toBe(clock.now() + OTP_TTL_MS);

    expect((await store.verify(PHONE, issued.code)).ok).toBe(true);
    // second use rejected — record was consumed/cleared
    expect((await store.verify(PHONE, issued.code)).ok).toBe(false);
  });

  it("rejects a mismatched code", async () => {
    const store = memoryStore();
    await store.issue(PHONE);
    const r = await store.verify(PHONE, "000000");
    expect(r).toEqual({ ok: false, reason: "mismatch" });
  });

  it("rejects an expired code after 5 minutes", async () => {
    const clock = new FakeClock();
    const store = memoryStore(clock);
    const issued = await store.issue(PHONE);
    if (!issued.ok) throw new Error("expected ok");
    clock.advance(OTP_TTL_MS + 1);
    expect(await store.verify(PHONE, issued.code)).toEqual({ ok: false, reason: "expired" });
  });

  it("locks out after too many verify attempts", async () => {
    const store = memoryStore();
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
    const store = memoryStore(clock);
    expect((await store.issue(PHONE)).ok).toBe(true);
    const second = await store.issue(PHONE);
    expect(second.ok).toBe(false);
    if (second.ok) throw new Error("unreachable");
    expect(second.reason).toBe("cooldown");
  });

  it("allows reissue after cooldown elapses", async () => {
    const clock = new FakeClock();
    const store = memoryStore(clock);
    expect((await store.issue(PHONE)).ok).toBe(true);
    clock.advance(OTP_RESEND_COOLDOWN_MS + 1);
    expect((await store.issue(PHONE)).ok).toBe(true);
  });

  it("rate-limits issue calls within the window", async () => {
    const clock = new FakeClock();
    const store = memoryStore(clock);

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
    const store = memoryStore(clock);
    expect((await store.issue(PHONE)).ok).toBe(true);
    expect((await store.issue("+2348099999999")).ok).toBe(true);
  });
});

const DURABLE_PHONE = "+2348100000524";

describe("OtpStore database", () => {
  beforeAll(() => {
    const prismaBin = path.join(process.cwd(), "node_modules", ".bin", "prisma");
    execFileSync(prismaBin, ["migrate", "deploy"], {
      cwd: process.cwd(),
      env: process.env,
      stdio: "pipe",
    });
  });

  afterEach(async () => {
    await prisma.otpCode.deleteMany({ where: { phone: DURABLE_PHONE } });
  });

  it("verifies a code issued by a different store instance", async () => {
    const clock = new FakeClock();
    const db = prismaOtpCodeDb();
    const issuer = new OtpStore(clock, db);
    const issued = await issuer.issue(DURABLE_PHONE);
    if (!issued.ok) throw new Error("expected ok");

    const stored = await prisma.otpCode.findUnique({ where: { phone: DURABLE_PHONE } });
    expect(stored?.hash).toBeTruthy();
    expect(stored?.attempts).toBe(0);

    const verifier = new OtpStore(clock, db);
    expect((await verifier.verify(DURABLE_PHONE, issued.code)).ok).toBe(true);
    expect(await prisma.otpCode.findUnique({ where: { phone: DURABLE_PHONE } })).toBeNull();

    const again = new OtpStore(clock, db);
    expect(await again.verify(DURABLE_PHONE, issued.code)).toEqual({
      ok: false,
      reason: "not_found",
    });
  });

  it("rejects an expired code stored in the database", async () => {
    const clock = new FakeClock();
    const db = prismaOtpCodeDb();
    const issuer = new OtpStore(clock, db);
    const issued = await issuer.issue(DURABLE_PHONE);
    if (!issued.ok) throw new Error("expected ok");

    clock.advance(OTP_TTL_MS + 1);
    const verifier = new OtpStore(clock, db);
    expect(await verifier.verify(DURABLE_PHONE, issued.code)).toEqual({
      ok: false,
      reason: "expired",
    });
    expect(await prisma.otpCode.findUnique({ where: { phone: DURABLE_PHONE } })).toBeNull();
  });

  it("rejects further tries after the stored attempt limit is exceeded", async () => {
    const clock = new FakeClock();
    const db = prismaOtpCodeDb();
    const issuer = new OtpStore(clock, db);
    await issuer.issue(DURABLE_PHONE);

    for (let i = 0; i < OTP_MAX_VERIFY_ATTEMPTS; i++) {
      const attempt = new OtpStore(clock, db);
      expect((await attempt.verify(DURABLE_PHONE, "000000")).ok).toBe(false);
    }

    const locked = new OtpStore(clock, db);
    expect(await locked.verify(DURABLE_PHONE, "000000")).toEqual({
      ok: false,
      reason: "too_many_attempts",
    });
  });
});
