import { beforeEach, describe, expect, it } from "vitest";
import { __resetRateLimitsForTests, consumeRateLimit } from "@/app/lib/rate-limit";

describe("consumeRateLimit", () => {
  beforeEach(() => __resetRateLimitsForTests());

  it("blocks once the per-key limit is reached within the window", () => {
    const opts = { max: 3, windowMs: 1000 };
    for (let i = 0; i < 3; i++)
      expect(consumeRateLimit("a", { ...opts, now: i }).allowed).toBe(true);
    const res = consumeRateLimit("a", { ...opts, now: 10 });
    expect(res).toEqual({ allowed: false, retryAfterSeconds: 1 });
  });

  it("tracks keys independently and recovers after the window", () => {
    const opts = { max: 1, windowMs: 1000 };
    expect(consumeRateLimit("a", { ...opts, now: 0 }).allowed).toBe(true);
    expect(consumeRateLimit("a", { ...opts, now: 1 }).allowed).toBe(false);
    expect(consumeRateLimit("b", { ...opts, now: 1 }).allowed).toBe(true);
    expect(consumeRateLimit("a", { ...opts, now: 1001 }).allowed).toBe(true);
  });
});
