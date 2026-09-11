/**
 * In-memory slot hold store: a successful public booking holds the slot for
 * 10 minutes so a second session receives HTTP 409 until the hold expires.
 */

export const SLOT_HOLD_TTL_MS = 10 * 60 * 1000;

export type SlotHoldKey = {
  tenantId: string;
  serviceId: string;
  startsAt: string;
};

export type SlotHoldRecord = {
  sessionId: string;
  bookingId: string | null;
  expiresAt: number;
};

export type AcquireHoldResult =
  | { ok: true; expiresAt: number }
  | { ok: false; reason: "held"; expiresAt: number; sessionId: string };

export interface Clock {
  now(): number;
}

const defaultClock: Clock = { now: () => Date.now() };

function holdKey(key: SlotHoldKey): string {
  return `${key.tenantId}::${key.serviceId}::${key.startsAt}`;
}

export class SlotHoldStore {
  private readonly holds = new Map<string, SlotHoldRecord>();
  private readonly clock: Clock;

  constructor(clock: Clock = defaultClock) {
    this.clock = clock;
  }

  /** Drop expired holds. Returns how many were released. */
  releaseExpired(now = this.clock.now()): number {
    let released = 0;
    for (const [key, record] of this.holds) {
      if (record.expiresAt <= now) {
        this.holds.delete(key);
        released += 1;
      }
    }
    return released;
  }

  get(key: SlotHoldKey, now = this.clock.now()): SlotHoldRecord | null {
    this.releaseExpired(now);
    return this.holds.get(holdKey(key)) ?? null;
  }

  isHeld(key: SlotHoldKey, sessionId?: string, now = this.clock.now()): boolean {
    const record = this.get(key, now);
    if (!record) {
      return false;
    }
    if (sessionId && record.sessionId === sessionId) {
      return false;
    }
    return true;
  }

  /**
   * Acquire (or refresh) a hold for `sessionId`. Another active session's hold
   * blocks acquisition until TTL expiry.
   */
  tryAcquire(
    key: SlotHoldKey,
    sessionId: string,
    options: { bookingId?: string | null; now?: number } = {}
  ): AcquireHoldResult {
    const now = options.now ?? this.clock.now();
    this.releaseExpired(now);

    const id = holdKey(key);
    const existing = this.holds.get(id);
    if (existing && existing.expiresAt > now && existing.sessionId !== sessionId) {
      return {
        ok: false,
        reason: "held",
        expiresAt: existing.expiresAt,
        sessionId: existing.sessionId,
      };
    }

    const expiresAt = now + SLOT_HOLD_TTL_MS;
    this.holds.set(id, {
      sessionId,
      bookingId: options.bookingId ?? existing?.bookingId ?? null,
      expiresAt,
    });
    return { ok: true, expiresAt };
  }

  release(key: SlotHoldKey): boolean {
    return this.holds.delete(holdKey(key));
  }

  reset(): void {
    this.holds.clear();
  }
}

let singleton: SlotHoldStore | null = null;

export function getSlotHoldStore(): SlotHoldStore {
  if (!singleton) {
    singleton = new SlotHoldStore();
  }
  return singleton;
}

export function __resetSlotHoldStoreForTests(): void {
  singleton = null;
}

export function __setSlotHoldStoreForTests(store: SlotHoldStore): void {
  singleton = store;
}
