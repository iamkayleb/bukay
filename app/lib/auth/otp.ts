import { createHash, randomInt } from "node:crypto";
import { prisma } from "@/app/db/prisma";

export const OTP_TTL_MS = 5 * 60 * 1000;
export const OTP_RESEND_COOLDOWN_MS = 30 * 1000;
export const OTP_MAX_REQUESTS_PER_WINDOW = 5;
export const OTP_RATE_WINDOW_MS = 15 * 60 * 1000;
export const OTP_MAX_VERIFY_ATTEMPTS = 5;

type RateRecord = {
  windowStart: number;
  count: number;
  lastSentAt: number;
};

export type IssueResult =
  | { ok: true; code: string; expiresAt: number }
  | { ok: false; reason: "cooldown" | "rate_limited"; retryAfterMs: number };

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: "not_found" | "expired" | "used" | "mismatch" | "too_many_attempts" };

function hashCode(phone: string, code: string): string {
  return createHash("sha256").update(`${phone}:${code}`).digest("hex");
}

function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export interface Clock {
  now(): number;
}

const defaultClock: Clock = { now: () => Date.now() };

export class OtpStore {
  // Codes live in the database (OtpCode), so any route handler or server
  // instance sees them. Only the issue rate limit is still per-process.
  private readonly rate = new Map<string, RateRecord>();
  private readonly clock: Clock;

  constructor(clock: Clock = defaultClock) {
    this.clock = clock;
  }

  async issue(phone: string): Promise<IssueResult> {
    const now = this.clock.now();
    const rate = this.rate.get(phone);

    if (rate) {
      if (now - rate.windowStart >= OTP_RATE_WINDOW_MS) {
        rate.windowStart = now;
        rate.count = 0;
      }
      if (rate.count >= OTP_MAX_REQUESTS_PER_WINDOW) {
        return {
          ok: false,
          reason: "rate_limited",
          retryAfterMs: rate.windowStart + OTP_RATE_WINDOW_MS - now,
        };
      }
      if (rate.lastSentAt && now - rate.lastSentAt < OTP_RESEND_COOLDOWN_MS) {
        return {
          ok: false,
          reason: "cooldown",
          retryAfterMs: rate.lastSentAt + OTP_RESEND_COOLDOWN_MS - now,
        };
      }
    }

    const code = generateCode();
    const row = { hash: hashCode(phone, code), expiresAt: new Date(now + OTP_TTL_MS), attempts: 0 };
    await prisma.otpCode.upsert({
      where: { phone },
      create: { phone, ...row },
      update: row,
    });

    if (rate) {
      rate.count += 1;
      rate.lastSentAt = now;
    } else {
      this.rate.set(phone, { windowStart: now, count: 1, lastSentAt: now });
    }

    return { ok: true, code, expiresAt: now + OTP_TTL_MS };
  }

  async verify(phone: string, code: string): Promise<VerifyResult> {
    const now = this.clock.now();
    const record = await prisma.otpCode.findUnique({ where: { phone } });
    if (!record) return { ok: false, reason: "not_found" };
    if (now >= record.expiresAt.getTime()) {
      await this.discard(phone);
      return { ok: false, reason: "expired" };
    }
    if (record.attempts >= OTP_MAX_VERIFY_ATTEMPTS) {
      await this.discard(phone);
      return { ok: false, reason: "too_many_attempts" };
    }

    // Count the attempt atomically; concurrent guesses can't share one slot.
    const claimed = await prisma.otpCode.updateMany({
      where: { phone, hash: record.hash, attempts: record.attempts },
      data: { attempts: { increment: 1 } },
    });
    if (claimed.count === 0) {
      // Row changed under us (reissued, consumed, or another attempt won).
      return this.verify(phone, code);
    }
    if (hashCode(phone, code) !== record.hash) {
      return { ok: false, reason: "mismatch" };
    }

    // Only the request that actually deletes the row consumes the code.
    const consumed = await prisma.otpCode.deleteMany({ where: { phone, hash: record.hash } });
    if (consumed.count === 0) return { ok: false, reason: "used" };
    return { ok: true };
  }

  private async discard(phone: string): Promise<void> {
    await prisma.otpCode.deleteMany({ where: { phone } });
  }

  async reset(): Promise<void> {
    await prisma.otpCode.deleteMany({});
    this.rate.clear();
  }
}

let singleton: OtpStore | null = null;

export function getOtpStore(): OtpStore {
  if (!singleton) singleton = new OtpStore();
  return singleton;
}

export function __resetOtpStoreForTests(): void {
  singleton = null;
}
