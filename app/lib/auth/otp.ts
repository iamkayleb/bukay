import { createHash, randomInt } from "node:crypto";
import { prisma } from "@/app/db/prisma";

export const OTP_TTL_MS = 5 * 60 * 1000;
export const OTP_RESEND_COOLDOWN_MS = 30 * 1000;
export const OTP_MAX_REQUESTS_PER_WINDOW = 5;
export const OTP_RATE_WINDOW_MS = 15 * 60 * 1000;
export const OTP_MAX_VERIFY_ATTEMPTS = 5;

export type OtpRecord = {
  hash: string;
  expiresAt: number;
  attempts: number;
  consumed: boolean;
};

export type RateRecord = {
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

export interface OtpStateStore {
  getCode(phone: string): Promise<OtpRecord | null>;
  setCode(phone: string, record: OtpRecord): Promise<void>;
  updateCode(phone: string, record: OtpRecord): Promise<void>;
  deleteCode(phone: string): Promise<void>;
  getRate(phone: string): Promise<RateRecord | null>;
  setRate(phone: string, record: RateRecord): Promise<void>;
  clear(): Promise<void>;
}

type PrismaOtpClient = {
  otpCode: {
    findUnique(args: { where: { phone: string } }): Promise<{
      hash: string;
      expiresAt: Date;
      attempts: number;
      consumed: boolean;
    } | null>;
    upsert(args: {
      where: { phone: string };
      create: {
        phone: string;
        hash: string;
        expiresAt: Date;
        attempts: number;
        consumed: boolean;
      };
      update: {
        hash?: string;
        expiresAt?: Date;
        attempts?: number;
        consumed?: boolean;
      };
    }): Promise<unknown>;
    deleteMany(args?: { where?: { phone?: string } }): Promise<unknown>;
  };
  otpRateLimit: {
    findUnique(args: { where: { phone: string } }): Promise<{
      windowStart: Date;
      count: number;
      lastSentAt: Date;
    } | null>;
    upsert(args: {
      where: { phone: string };
      create: { phone: string; windowStart: Date; count: number; lastSentAt: Date };
      update: { windowStart?: Date; count?: number; lastSentAt?: Date };
    }): Promise<unknown>;
    deleteMany(args?: { where?: { phone?: string } }): Promise<unknown>;
  };
};

export class PrismaOtpStateStore implements OtpStateStore {
  constructor(private readonly client: PrismaOtpClient = prisma as unknown as PrismaOtpClient) {}

  async getCode(phone: string): Promise<OtpRecord | null> {
    const record = await this.client.otpCode.findUnique({ where: { phone } });
    if (!record) return null;

    return {
      hash: record.hash,
      expiresAt: record.expiresAt.getTime(),
      attempts: record.attempts,
      consumed: record.consumed,
    };
  }

  async setCode(phone: string, record: OtpRecord): Promise<void> {
    await this.client.otpCode.upsert({
      where: { phone },
      create: {
        phone,
        hash: record.hash,
        expiresAt: new Date(record.expiresAt),
        attempts: record.attempts,
        consumed: record.consumed,
      },
      update: {
        hash: record.hash,
        expiresAt: new Date(record.expiresAt),
        attempts: record.attempts,
        consumed: record.consumed,
      },
    });
  }

  async updateCode(phone: string, record: OtpRecord): Promise<void> {
    await this.setCode(phone, record);
  }

  async deleteCode(phone: string): Promise<void> {
    await this.client.otpCode.deleteMany({ where: { phone } });
  }

  async getRate(phone: string): Promise<RateRecord | null> {
    const record = await this.client.otpRateLimit.findUnique({ where: { phone } });
    if (!record) return null;

    return {
      windowStart: record.windowStart.getTime(),
      count: record.count,
      lastSentAt: record.lastSentAt.getTime(),
    };
  }

  async setRate(phone: string, record: RateRecord): Promise<void> {
    await this.client.otpRateLimit.upsert({
      where: { phone },
      create: {
        phone,
        windowStart: new Date(record.windowStart),
        count: record.count,
        lastSentAt: new Date(record.lastSentAt),
      },
      update: {
        windowStart: new Date(record.windowStart),
        count: record.count,
        lastSentAt: new Date(record.lastSentAt),
      },
    });
  }

  async clear(): Promise<void> {
    await this.client.otpCode.deleteMany();
    await this.client.otpRateLimit.deleteMany();
  }
}

export class MemoryOtpStateStore implements OtpStateStore {
  private readonly codes = new Map<string, OtpRecord>();
  private readonly rate = new Map<string, RateRecord>();

  async getCode(phone: string): Promise<OtpRecord | null> {
    const record = this.codes.get(phone);
    return record ? { ...record } : null;
  }

  async setCode(phone: string, record: OtpRecord): Promise<void> {
    this.codes.set(phone, { ...record });
  }

  async updateCode(phone: string, record: OtpRecord): Promise<void> {
    await this.setCode(phone, record);
  }

  async deleteCode(phone: string): Promise<void> {
    this.codes.delete(phone);
  }

  async getRate(phone: string): Promise<RateRecord | null> {
    const record = this.rate.get(phone);
    return record ? { ...record } : null;
  }

  async setRate(phone: string, record: RateRecord): Promise<void> {
    this.rate.set(phone, { ...record });
  }

  async clear(): Promise<void> {
    this.codes.clear();
    this.rate.clear();
  }
}

export class OtpStore {
  private readonly clock: Clock;
  private readonly state: OtpStateStore;

  constructor(clock: Clock = defaultClock, state: OtpStateStore = new PrismaOtpStateStore()) {
    this.clock = clock;
    this.state = state;
  }

  async issue(phone: string): Promise<IssueResult> {
    const now = this.clock.now();
    const rate = await this.state.getRate(phone);

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
    await this.state.setCode(phone, {
      hash: hashCode(phone, code),
      expiresAt: now + OTP_TTL_MS,
      attempts: 0,
      consumed: false,
    });

    if (rate) {
      rate.count += 1;
      rate.lastSentAt = now;
      await this.state.setRate(phone, rate);
    } else {
      await this.state.setRate(phone, { windowStart: now, count: 1, lastSentAt: now });
    }

    return { ok: true, code, expiresAt: now + OTP_TTL_MS };
  }

  async verify(phone: string, code: string): Promise<VerifyResult> {
    const now = this.clock.now();
    const record = await this.state.getCode(phone);
    if (!record) return { ok: false, reason: "not_found" };
    if (record.consumed) return { ok: false, reason: "used" };
    if (now >= record.expiresAt) {
      await this.state.deleteCode(phone);
      return { ok: false, reason: "expired" };
    }
    if (record.attempts >= OTP_MAX_VERIFY_ATTEMPTS) {
      await this.state.deleteCode(phone);
      return { ok: false, reason: "too_many_attempts" };
    }

    record.attempts += 1;
    if (hashCode(phone, code) !== record.hash) {
      await this.state.updateCode(phone, record);
      return { ok: false, reason: "mismatch" };
    }

    record.consumed = true;
    await this.state.updateCode(phone, record);
    return { ok: true };
  }

  async reset(): Promise<void> {
    await this.state.clear();
  }
}

let singleton: OtpStore | null = null;
let stateStoreOverride: OtpStateStore | null = null;

export function getOtpStore(): OtpStore {
  if (!singleton) singleton = new OtpStore(defaultClock, stateStoreOverride ?? undefined);
  return singleton;
}

export function __resetOtpStoreForTests(): void {
  singleton = null;
  stateStoreOverride = null;
}

export function setOtpStateStoreForTests(state: OtpStateStore): void {
  stateStoreOverride = state;
  singleton = null;
}
