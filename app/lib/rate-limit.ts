// In-memory sliding-window rate limiter keyed by sender number. Per-process
// only; swap the store for a shared one if the app runs on several instances.
export const RATE_LIMIT_MAX = 10;
export const RATE_LIMIT_WINDOW_MS = 60_000;

export type RateLimitOptions = { max?: number; windowMs?: number; now?: number };

export type RateLimitResult = {
  allowed: boolean;
  /** Seconds until the oldest hit leaves the window; 0 when allowed. */
  retryAfterSeconds: number;
};

const hits = new Map<string, number[]>();

function purgeStale(now: number, windowMs: number): void {
  for (const [key, stamps] of hits) {
    if (stamps.length === 0 || stamps[stamps.length - 1] <= now - windowMs) hits.delete(key);
  }
}

/** Records one hit for `key` and reports whether it is within the limit. */
export function consumeRateLimit(key: string, options: RateLimitOptions = {}): RateLimitResult {
  const max = options.max ?? RATE_LIMIT_MAX;
  const windowMs = options.windowMs ?? RATE_LIMIT_WINDOW_MS;
  const now = options.now ?? Date.now();

  purgeStale(now, windowMs);
  const stamps = (hits.get(key) ?? []).filter((t) => t > now - windowMs);

  if (stamps.length >= max) {
    hits.set(key, stamps);
    return { allowed: false, retryAfterSeconds: Math.ceil((stamps[0] + windowMs - now) / 1000) };
  }
  stamps.push(now);
  hits.set(key, stamps);
  return { allowed: true, retryAfterSeconds: 0 };
}

export function __resetRateLimitsForTests(): void {
  hits.clear();
}
