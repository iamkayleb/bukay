/** Default retention for processed webhook / request keys. */
export const IDEMPOTENCY_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface Clock {
  now(): number;
}

const defaultClock: Clock = { now: () => Date.now() };

type IdempotencyRecord = {
  expiresAt: number;
  value?: unknown;
};

/**
 * In-memory idempotency store with a 7-day TTL.
 * `claim` returns true the first time a key is seen; subsequent calls within
 * the TTL return false so callers can skip duplicate side effects.
 */
export class IdempotencyStore {
  private readonly entries = new Map<string, IdempotencyRecord>();
  private readonly clock: Clock;
  private readonly ttlMs: number;

  constructor(clock: Clock = defaultClock, ttlMs: number = IDEMPOTENCY_TTL_MS) {
    this.clock = clock;
    this.ttlMs = ttlMs;
  }

  /** True when the key was already claimed and has not expired. */
  has(key: string): boolean {
    return this.getRecord(key) !== null;
  }

  /**
   * Atomically claim a key. Returns true if this is the first claim (caller
   * should perform the side effect). Returns false for a replay within TTL.
   */
  claim(key: string, value?: unknown): boolean {
    if (this.getRecord(key)) {
      return false;
    }
    this.entries.set(key, {
      expiresAt: this.clock.now() + this.ttlMs,
      value,
    });
    return true;
  }

  get<T = unknown>(key: string): T | undefined {
    const record = this.getRecord(key);
    return record ? (record.value as T | undefined) : undefined;
  }

  reset(): void {
    this.entries.clear();
  }

  private getRecord(key: string): IdempotencyRecord | null {
    const record = this.entries.get(key);
    if (!record) return null;
    if (this.clock.now() >= record.expiresAt) {
      this.entries.delete(key);
      return null;
    }
    return record;
  }
}

let singleton: IdempotencyStore | null = null;

export function getIdempotencyStore(): IdempotencyStore {
  if (!singleton) singleton = new IdempotencyStore();
  return singleton;
}

export function __resetIdempotencyStoreForTests(): void {
  singleton?.reset();
  singleton = null;
}

export function __setIdempotencyStoreForTests(store: IdempotencyStore): void {
  singleton = store;
}
