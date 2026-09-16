// In-memory idempotency store for at-least-once event delivery (e.g. Paystack
// webhook retries). Entries expire after seven days, matching Paystack's own
// retry window, so the map cannot grow unbounded across a long-lived process.
export const IDEMPOTENCY_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type Entry = { expiresAt: number };

const seen = new Map<string, Entry>();

function purgeExpired(now: number): void {
  for (const [key, entry] of seen) {
    if (entry.expiresAt <= now) {
      seen.delete(key);
    }
  }
}

export function hasProcessed(key: string, now: number = Date.now()): boolean {
  purgeExpired(now);
  const entry = seen.get(key);
  return !!entry && entry.expiresAt > now;
}

export function markProcessed(key: string, now: number = Date.now()): void {
  seen.set(key, { expiresAt: now + IDEMPOTENCY_TTL_MS });
}

export function __resetIdempotencyStoreForTests(): void {
  seen.clear();
}
