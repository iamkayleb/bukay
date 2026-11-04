import { canonicalCustomerPhone } from "@/app/lib/whatsapp/routing";

/** Inbound messages allowed from one phone number inside the window. */
export const SENDER_RATE_LIMIT = 5;

/** Fixed window for per-number inbound rate limiting. */
export const SENDER_RATE_WINDOW_MS = 60_000;

export type RateLimitClock = {
  now(): number;
};

export type RateLimitAllowed = {
  allowed: true;
  remaining: number;
};

export type RateLimitDenied = {
  allowed: false;
  status: 429;
  error: "rate_limited";
  retryAfterSeconds: number;
};

export type RateLimitDecision = RateLimitAllowed | RateLimitDenied;

const defaultClock: RateLimitClock = { now: () => Date.now() };

/**
 * Bucket key for a sender. Nigerian numbers share one bucket across local and E.164 forms.
 */
export function senderRateLimitKey(phone: string): string {
  const canonical = canonicalCustomerPhone(phone);
  if (canonical) return canonical;
  const digits = phone.replace(/\D/g, "");
  return digits || phone.trim();
}

/**
 * Counts inbound messages per phone number and denies the sender once the window is full.
 * A denied decision is HTTP 429.
 */
export class SenderRateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly limit = SENDER_RATE_LIMIT,
    private readonly windowMs = SENDER_RATE_WINDOW_MS,
    private readonly clock: RateLimitClock = defaultClock
  ) {}

  consume(phone: string): RateLimitDecision {
    const key = senderRateLimitKey(phone);
    const now = this.clock.now();
    const windowStart = now - this.windowMs;
    const recent = (this.hits.get(key) ?? []).filter((timestamp) => timestamp > windowStart);

    if (recent.length >= this.limit) {
      const oldest = recent[0] ?? now;
      const retryAfterMs = Math.max(0, oldest + this.windowMs - now);
      this.hits.set(key, recent);
      return {
        allowed: false,
        status: 429,
        error: "rate_limited",
        retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)),
      };
    }

    recent.push(now);
    this.hits.set(key, recent);
    return { allowed: true, remaining: this.limit - recent.length };
  }

  reset(): void {
    this.hits.clear();
  }
}

let sharedLimiter: SenderRateLimiter | null = null;

/** Process-wide limiter used by the public inbound channel. */
export function getSenderRateLimiter(): SenderRateLimiter {
  if (!sharedLimiter) {
    sharedLimiter = new SenderRateLimiter();
  }
  return sharedLimiter;
}

/** Test-only replacement for the shared limiter. Pass null to restore a fresh default. */
export function __setSenderRateLimiterForTests(limiter: SenderRateLimiter | null): void {
  sharedLimiter = limiter;
}
