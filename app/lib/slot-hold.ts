import { randomUUID } from "node:crypto";

export const SLOT_HOLD_TTL_MS = 10 * 60 * 1000;

export type SlotHoldKey = {
  tenantId: string;
  serviceId: string;
  staffId: string | null;
  startsAt: Date;
};

export type AcquireResult =
  | { ok: true; holdId: string; expiresAt: number }
  | { ok: false; reason: "held"; expiresAt: number };

type HoldRecord = {
  holdId: string;
  expiresAt: number;
};

export interface Clock {
  now(): number;
}

const defaultClock: Clock = { now: () => Date.now() };

function keyFor({ tenantId, serviceId, staffId, startsAt }: SlotHoldKey): string {
  return `${tenantId}:${serviceId}:${staffId ?? "any"}:${startsAt.toISOString()}`;
}

/**
 * In-memory only, mirroring OtpStore (app/lib/auth/otp.ts) — acceptable here
 * because a hold is a short-lived (10 min) soft lock, not the booking record
 * of truth. It does not survive a process restart or coordinate across
 * multiple server instances.
 */
export class SlotHoldStore {
  private readonly holds = new Map<string, HoldRecord>();
  private readonly clock: Clock;

  constructor(clock: Clock = defaultClock) {
    this.clock = clock;
  }

  acquire(key: SlotHoldKey, ttlMs: number = SLOT_HOLD_TTL_MS): AcquireResult {
    const now = this.clock.now();
    const k = keyFor(key);
    const existing = this.holds.get(k);

    if (existing && existing.expiresAt > now) {
      return { ok: false, reason: "held", expiresAt: existing.expiresAt };
    }

    const holdId = randomUUID();
    const expiresAt = now + ttlMs;
    this.holds.set(k, { holdId, expiresAt });
    return { ok: true, holdId, expiresAt };
  }

  release(key: SlotHoldKey, holdId: string): void {
    const k = keyFor(key);
    const existing = this.holds.get(k);
    if (existing && existing.holdId === holdId) {
      this.holds.delete(k);
    }
  }

  reset(): void {
    this.holds.clear();
  }
}

let singleton: SlotHoldStore | null = null;

export function getSlotHoldStore(): SlotHoldStore {
  if (!singleton) singleton = new SlotHoldStore();
  return singleton;
}

export function __resetSlotHoldStoreForTests(): void {
  singleton = null;
}
