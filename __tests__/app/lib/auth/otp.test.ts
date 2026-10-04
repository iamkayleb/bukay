import { describe, expect, it } from "vitest";
import {
  OTP_MAX_REQUESTS_PER_WINDOW,
  OTP_MAX_VERIFY_ATTEMPTS,
  OTP_RESEND_COOLDOWN_MS,
  OTP_TTL_MS,
  type OtpCodeDelegate,
  type OtpRecord,
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

class MemoryOtpCodes implements OtpCodeDelegate {
  readonly rows = new Map<string, OtpRecord>();

  async upsert(args: unknown): Promise<void> {
    const { where, create, update } = args as {
      where: { phone: string };
      create: OtpRecord & { phone: string };
      update: Partial<OtpRecord>;
    };
    const existing = this.rows.get(where.phone);
    this.rows.set(where.phone, existing ? { ...existing, ...update } : create);
  }

  async findUnique(args: unknown): Promise<OtpRecord | null> {
    const record = this.rows.get((args as { where: { phone: string } }).where.phone);
    return record ? { ...record } : null;
  }

  async update(args: unknown): Promise<void> {
    const { where, data } = args as {
      where: { phone: string };
      data: { attempts: { increment: number } };
    };
    const record = this.rows.get(where.phone);
    if (!record) throw new Error("record not found");
    this.rows.set(where.phone, { ...record, attempts: record.attempts + data.attempts.increment });
  }

  async delete(args: unknown): Promise<void> {
    this.rows.delete((args as { where: { phone: string } }).where.phone);
  }
}

const PHONE = "+2348031234567";

function makeStore(clock = new FakeClock(), codes = new MemoryOtpCodes()) {
  return { clock, codes, store: new OtpStore(clock, codes) };
}

describe("OtpStore", () => {
  it("issues a 6-digit code and verifies it once", async () => {
    const { clock, store } = makeStore();
    const issued = await store.issue(PHONE);
    if (!issued.ok) throw new Error("expected ok");
    expect(issued.code).toMatch(/^\d{6}$/);
    expect(issued.expiresAt).toBe(clock.now() + OTP_TTL_MS);

    expect((await store.verify(PHONE, issued.code)).ok).toBe(true);
    expect((await store.verify(PHONE, issued.code)).ok).toBe(false);
  });

  it("verifies an issued code through a separate store instance", async () => {
    const clock = new FakeClock();
    const codes = new MemoryOtpCodes();
    const issued = await new OtpStore(clock, codes).issue(PHONE);
    if (!issued.ok) throw new Error("expected ok");

    await expect(new OtpStore(clock, codes).verify(PHONE, issued.code)).resolves.toEqual({
      ok: true,
    });
  });

  it("rejects a mismatched code", async () => {
    const { store } = makeStore();
    await store.issue(PHONE);
    await expect(store.verify(PHONE, "000000")).resolves.toEqual({ ok: false, reason: "mismatch" });
  });

  it("rejects an expired code after 5 minutes", async () => {
    const { clock, store } = makeStore();
    const issued = await store.issue(PHONE);
    if (!issued.ok) throw new Error("expected ok");
    clock.advance(OTP_TTL_MS + 1);
    await expect(store.verify(PHONE, issued.code)).resolves.toEqual({
      ok: false,
      reason: "expired",
    });
  });

  it("locks out after too many verify attempts", async () => {
    const { store } = makeStore();
    await store.issue(PHONE);
    for (let i = 0; i < OTP_MAX_VERIFY_ATTEMPTS; i++) {
      expect((await store.verify(PHONE, "000000")).ok).toBe(false);
    }
    await expect(store.verify(PHONE, "000000")).resolves.toEqual({
      ok: false,
      reason: "too_many_attempts",
    });
  });

  it("enforces resend cooldown between consecutive issue calls", async () => {
    const { store } = makeStore();
    expect((await store.issue(PHONE)).ok).toBe(true);
    const second = await store.issue(PHONE);
    expect(second.ok).toBe(false);
    if (second.ok) throw new Error("unreachable");
    expect(second.reason).toBe("cooldown");
  });

  it("allows reissue after cooldown elapses", async () => {
    const { clock, store } = makeStore();
    expect((await store.issue(PHONE)).ok).toBe(true);
    clock.advance(OTP_RESEND_COOLDOWN_MS + 1);
    expect((await store.issue(PHONE)).ok).toBe(true);
  });

  it("rate-limits issue calls within the window", async () => {
    const { clock, store } = makeStore();
    for (let i = 0; i < OTP_MAX_REQUESTS_PER_WINDOW; i++) {
      expect((await store.issue(PHONE)).ok).toBe(true);
      clock.advance(OTP_RESEND_COOLDOWN_MS + 1);
    }
    const blocked = await store.issue(PHONE);
    expect(blocked.ok).toBe(false);
    if (blocked.ok) throw new Error("unreachable");
    expect(blocked.reason).toBe("rate_limited");
  });

  it("isolates rate limit by phone number", async () => {
    const { store } = makeStore();
    expect((await store.issue(PHONE)).ok).toBe(true);
    expect((await store.issue("+2348099999999")).ok).toBe(true);
  });
});
