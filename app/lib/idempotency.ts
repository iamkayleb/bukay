/**
 * Idempotency keys for webhook / request deduplication.
 *
 * Production path uses a durable Prisma `IdempotencyKey` row (unique `key`,
 * 7-day `expiresAt`) so replay protection survives process restarts and works
 * across serverless replicas. An in-memory store remains available for unit
 * tests that inject a fake clock.
 */

import { isUniqueConstraintError } from "@/app/api/services/_helpers";

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

export type IdempotencyKeyDb = {
  idempotencyKey: {
    findUnique(args: { where: { key: string } }): Promise<{
      key: string;
      expiresAt: Date;
    } | null>;
    create(args: {
      data: { key: string; expiresAt: Date };
    }): Promise<{ key: string; expiresAt: Date }>;
    deleteMany(args: {
      where: { key?: string; expiresAt?: { lte: Date } };
    }): Promise<{ count: number }>;
  };
};

/** Sync or async claimer used by webhook handlers and tests. */
export interface IdempotencyClaimer {
  has(key: string): boolean | Promise<boolean>;
  claim(key: string, value?: unknown): boolean | Promise<boolean>;
}

/**
 * In-memory idempotency store with a 7-day TTL.
 * Prefer {@link claimIdempotencyKey} in production so claims are durable.
 */
export class IdempotencyStore implements IdempotencyClaimer {
  private readonly entries = new Map<string, IdempotencyRecord>();
  private readonly clock: Clock;
  private readonly ttlMs: number;

  constructor(clock: Clock = defaultClock, ttlMs: number = IDEMPOTENCY_TTL_MS) {
    this.clock = clock;
    this.ttlMs = ttlMs;
  }

  has(key: string): boolean {
    return this.getRecord(key) !== null;
  }

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

/**
 * Atomically claim `key` in the database. Survives restarts and multi-instance
 * deploys. Expired rows are cleared so the key can be reclaimed after TTL.
 */
export async function claimIdempotencyKey(
  db: { idempotencyKey?: IdempotencyKeyDb["idempotencyKey"] },
  key: string,
  ttlMs: number = IDEMPOTENCY_TTL_MS,
  now: Date = new Date()
): Promise<boolean> {
  const table = db.idempotencyKey;
  if (!table) {
    // Fallback when a test stub omits the table: treat as first claim.
    // Production Prisma clients always expose idempotencyKey after migrate.
    return true;
  }

  await table.deleteMany({ where: { expiresAt: { lte: now } } });

  const existing = await table.findUnique({ where: { key } });
  if (existing && existing.expiresAt.getTime() > now.getTime()) {
    return false;
  }
  if (existing) {
    await table.deleteMany({ where: { key } });
  }

  try {
    await table.create({
      data: {
        key,
        expiresAt: new Date(now.getTime() + ttlMs),
      },
    });
    return true;
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return false;
    }
    throw error;
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
