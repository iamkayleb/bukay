import { createHash, randomInt } from "node:crypto";
import { prisma } from "@/app/db/prisma";

export const OTP_TTL_MS = 5 * 60 * 1000;
export const OTP_RESEND_COOLDOWN_MS = 30 * 1000;
export const OTP_MAX_REQUESTS_PER_WINDOW = 5;
export const OTP_RATE_WINDOW_MS = 15 * 60 * 1000;
export const OTP_MAX_VERIFY_ATTEMPTS = 5;

export type OtpRecord = {
  hash: string;
  expiresAt: Date;
  attempts: number;
};

export type OtpCodeDelegate = {
  upsert(args: unknown): Promise<unknown>;
  findUnique(args: unknown): Promise<OtpRecord | null>;
  update(args: unknown): Promise<unknown>;
  delete(args: unknown): Promise<unknown>;
};

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
  private readonly rate = new Map<string, RateRecord>();
  private readonly clock: Clock;

  constructor(
    clock: Clock = defaultClock,
    private readonly codes: OtpCodeDelegate = prisma.otpCode
  ) {
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
    const expiresAt = new Date(now + OTP_TTL_MS);
    await this.codes.upsert({
      where: { phone },
      create: { phone, hash: hashCode(phone, code), expiresAt, attempts: 0 },
      update: { hash: hashCode(phone, code), expiresAt, attempts: 0 },
    });

    if (rate) {
      rate.count += 1;
      rate.lastSentAt = now;
    } else {
      this.rate.set(phone, { windowStart: now, count: 1, lastSentAt: now });
    }

    return { ok: true, code, expiresAt: expiresAt.getTime() };
  }

  async verify(phone: string, code: string): Promise<VerifyResult> {
    const now = this.clock.now();
    const record = await this.codes.findUnique({ where: { phone } });
    if (!record) return { ok: false, reason: "not_found" };
    if (now >= record.expiresAt.getTime()) {
      await this.codes.delete({ where: { phone } });
      return { ok: false, reason: "expired" };
    }
    if (record.attempts >= OTP_MAX_VERIFY_ATTEMPTS) {
      await this.codes.delete({ where: { phone } });
      return { ok: false, reason: "too_many_attempts" };
    }

    await this.codes.update({ where: { phone }, data: { attempts: { increment: 1 } } });
    if (hashCode(phone, code) !== record.hash) {
      return { ok: false, reason: "mismatch" };
    }

    await this.codes.delete({ where: { phone } });
    return { ok: true };
  }

  reset(): void {
    this.rate.clear();
  }
}

let singleton: OtpStore | null = null;

export function getOtpStore(): OtpStore {
  if (!singleton) singleton = new OtpStore();
  return singleton;
}

export function setOtpStoreForTests(store: OtpStore): void {
  singleton = store;
}

export function __resetOtpStoreForTests(): void {
  singleton = null;
}
