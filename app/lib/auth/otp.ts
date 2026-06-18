import { createHash, randomInt } from "node:crypto";

export const OTP_TTL_MS = 5 * 60 * 1000;
export const OTP_RESEND_COOLDOWN_MS = 30 * 1000;
export const OTP_MAX_REQUESTS_PER_WINDOW = 5;
export const OTP_RATE_WINDOW_MS = 15 * 60 * 1000;
export const OTP_MAX_VERIFY_ATTEMPTS = 5;

type OtpRecord = {
  hash: string;
  expiresAt: number;
  attempts: number;
  consumed: boolean;
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
  private readonly codes = new Map<string, OtpRecord>();
  private readonly rate = new Map<string, RateRecord>();
  private readonly clock: Clock;

  constructor(clock: Clock = defaultClock) {
    this.clock = clock;
  }

  issue(phone: string): IssueResult {
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
    this.codes.set(phone, {
      hash: hashCode(phone, code),
      expiresAt: now + OTP_TTL_MS,
      attempts: 0,
      consumed: false,
    });

    if (rate) {
      rate.count += 1;
      rate.lastSentAt = now;
    } else {
      this.rate.set(phone, { windowStart: now, count: 1, lastSentAt: now });
    }

    return { ok: true, code, expiresAt: now + OTP_TTL_MS };
  }

  verify(phone: string, code: string): VerifyResult {
    const now = this.clock.now();
    const record = this.codes.get(phone);
    if (!record) return { ok: false, reason: "not_found" };
    if (record.consumed) return { ok: false, reason: "used" };
    if (now >= record.expiresAt) {
      this.codes.delete(phone);
      return { ok: false, reason: "expired" };
    }
    if (record.attempts >= OTP_MAX_VERIFY_ATTEMPTS) {
      this.codes.delete(phone);
      return { ok: false, reason: "too_many_attempts" };
    }

    record.attempts += 1;
    if (hashCode(phone, code) !== record.hash) {
      return { ok: false, reason: "mismatch" };
    }

    record.consumed = true;
    this.codes.delete(phone);
    return { ok: true };
  }

  reset(): void {
    this.codes.clear();
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
