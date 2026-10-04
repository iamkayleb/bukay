import { describe, expect, it } from "vitest";

import {
  SENDER_RATE_LIMIT,
  SENDER_RATE_WINDOW_MS,
  SenderRateLimiter,
  senderRateLimitKey,
  type RateLimitClock,
} from "@/app/lib/rate-limit";

class FakeClock implements RateLimitClock {
  constructor(public t = 1_700_000_000_000) {}
  now() {
    return this.t;
  }
  advance(ms: number) {
    this.t += ms;
  }
}

describe("sender rate limit", () => {
  it("keys Nigerian local and E.164 forms to the same number", () => {
    expect(senderRateLimitKey("08031234567")).toBe("+2348031234567");
    expect(senderRateLimitKey("+2348031234567")).toBe("+2348031234567");
    expect(senderRateLimitKey("2348031234567")).toBe("+2348031234567");
  });

  it("allows messages inside the window and returns HTTP 429 once the sender floods", () => {
    const clock = new FakeClock();
    const limiter = new SenderRateLimiter(SENDER_RATE_LIMIT, SENDER_RATE_WINDOW_MS, clock);
    const phone = "08031234567";

    for (let i = 0; i < SENDER_RATE_LIMIT; i += 1) {
      const decision = limiter.consume(phone);
      expect(decision.allowed).toBe(true);
      if (decision.allowed) {
        expect(decision.remaining).toBe(SENDER_RATE_LIMIT - (i + 1));
      }
    }

    const blocked = limiter.consume("2348031234567");
    expect(blocked).toMatchObject({
      allowed: false,
      status: 429,
      error: "rate_limited",
    });
    if (blocked.allowed) throw new Error("expected a denial");
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("does not count a different number against the flooded sender", () => {
    const limiter = new SenderRateLimiter(1, SENDER_RATE_WINDOW_MS, new FakeClock());
    expect(limiter.consume("+2348031234567").allowed).toBe(true);
    expect(limiter.consume("+2348031234567").allowed).toBe(false);
    expect(limiter.consume("+2348099999999").allowed).toBe(true);
  });

  it("opens the window again after it elapses", () => {
    const clock = new FakeClock();
    const limiter = new SenderRateLimiter(1, SENDER_RATE_WINDOW_MS, clock);
    expect(limiter.consume("+2348031234567").allowed).toBe(true);
    expect(limiter.consume("+2348031234567").allowed).toBe(false);
    clock.advance(SENDER_RATE_WINDOW_MS + 1);
    expect(limiter.consume("+2348031234567").allowed).toBe(true);
  });
});
