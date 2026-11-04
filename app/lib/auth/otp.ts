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

export type OtpCodeRow = {
  phone: string;
  hash: string;
  expiresAt: Date;
  attempts: number;
};

/**
 * Persistence for one-time codes. Production uses Prisma `OtpCode` rows.
 * Rate-limit counters stay on the store instance; deleting a consumed code
 * must not reset the resend window.
 */
export interface OtpCodeDb {
  upsert(row: OtpCodeRow): Promise<void>;
  findByPhone(phone: string): Promise<OtpCodeRow | null>;
  updateAttempts(phone: string, attempts: number): Promise<void>;
  deleteByPhone(phone: string): Promise<void>;
}

export class MemoryOtpCodeDb implements OtpCodeDb {
  private readonly rows = new Map<string, OtpCodeRow>();

  async upsert(row: OtpCodeRow): Promise<void> {
    this.rows.set(row.phone, {
      phone: row.phone,
      hash: row.hash,
      expiresAt: new Date(row.expiresAt.getTime()),
      attempts: row.attempts,
    });
  }

  async findByPhone(phone: string): Promise<OtpCodeRow | null> {
    const row = this.rows.get(phone);
    if (!row) return null;
    return {
      phone: row.phone,
      hash: row.hash,
      expiresAt: new Date(row.expiresAt.getTime()),
      attempts: row.attempts,
    };
  }

  async updateAttempts(phone: string, attempts: number): Promise<void> {
    const row = this.rows.get(phone);
    if (!row) return;
    row.attempts = attempts;
  }

  async deleteByPhone(phone: string): Promise<void> {
    this.rows.delete(phone);
  }
}

type OtpCodeDelegate = {
  upsert(args: {
    where: { phone: string };
    create: OtpCodeRow;
    update: { hash: string; expiresAt: Date; attempts: number };
  }): Promise<OtpCodeRow>;
  findUnique(args: { where: { phone: string } }): Promise<OtpCodeRow | null>;
  update(args: { where: { phone: string }; data: { attempts: number } }): Promise<OtpCodeRow>;
  deleteMany(args: { where: { phone: string } }): Promise<{ count: number }>;
};

export function prismaOtpCodeDb(table: OtpCodeDelegate = prisma.otpCode): OtpCodeDb {
  return {
    async upsert(row) {
      await table.upsert({
        where: { phone: row.phone },
        create: {
          phone: row.phone,
          hash: row.hash,
          expiresAt: row.expiresAt,
          attempts: row.attempts,
        },
        update: {
          hash: row.hash,
          expiresAt: row.expiresAt,
          attempts: row.attempts,
        },
      });
    },
    async findByPhone(phone) {
      return table.findUnique({ where: { phone } });
    },
    async updateAttempts(phone, attempts) {
      await table.update({ where: { phone }, data: { attempts } });
    },
    async deleteByPhone(phone) {
      await table.deleteMany({ where: { phone } });
    },
  };
}

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
  private readonly codes: OtpCodeDb;
  private readonly rate = new Map<string, RateRecord>();
  private readonly clock: Clock;

  constructor(clock: Clock = defaultClock, codes: OtpCodeDb = prismaOtpCodeDb()) {
    this.clock = clock;
    this.codes = codes;
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
    const expiresAt = now + OTP_TTL_MS;
    await this.codes.upsert({
      phone,
      hash: hashCode(phone, code),
      expiresAt: new Date(expiresAt),
      attempts: 0,
    });

    if (rate) {
      rate.count += 1;
      rate.lastSentAt = now;
    } else {
      this.rate.set(phone, { windowStart: now, count: 1, lastSentAt: now });
    }

    return { ok: true, code, expiresAt };
  }

  async verify(phone: string, code: string): Promise<VerifyResult> {
    const now = this.clock.now();
    const record = await this.codes.findByPhone(phone);
    if (!record) return { ok: false, reason: "not_found" };
    if (now >= record.expiresAt.getTime()) {
      await this.codes.deleteByPhone(phone);
      return { ok: false, reason: "expired" };
    }
    if (record.attempts >= OTP_MAX_VERIFY_ATTEMPTS) {
      await this.codes.deleteByPhone(phone);
      return { ok: false, reason: "too_many_attempts" };
    }

    const attempts = record.attempts + 1;
    await this.codes.updateAttempts(phone, attempts);
    if (hashCode(phone, code) !== record.hash) {
      return { ok: false, reason: "mismatch" };
    }

    await this.codes.deleteByPhone(phone);
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

export function __resetOtpStoreForTests(): void {
  singleton?.reset();
  singleton = null;
}

export async function __deletePersistedOtpCodesForTests(phones: string[]): Promise<void> {
  if (phones.length === 0) return;
  await prisma.otpCode.deleteMany({ where: { phone: { in: phones } } });
}
