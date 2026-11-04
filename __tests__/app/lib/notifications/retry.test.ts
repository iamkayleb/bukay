import { describe, expect, it, vi } from "vitest";

import { computeBackoffDelay, withBackoff } from "@/app/lib/notifications/retry";

describe("computeBackoffDelay", () => {
  it("doubles the base delay per attempt and caps at maxDelayMs", () => {
    expect(computeBackoffDelay(1, { baseDelayMs: 100, maxDelayMs: 10_000 })).toBe(100);
    expect(computeBackoffDelay(2, { baseDelayMs: 100, maxDelayMs: 10_000 })).toBe(200);
    expect(computeBackoffDelay(3, { baseDelayMs: 100, maxDelayMs: 10_000 })).toBe(400);
    expect(computeBackoffDelay(8, { baseDelayMs: 100, maxDelayMs: 500 })).toBe(500);
  });

  it("applies jitter when enabled", () => {
    const delay = computeBackoffDelay(1, {
      baseDelayMs: 100,
      maxDelayMs: 10_000,
      jitter: true,
      random: () => 0.5,
    });
    expect(delay).toBe(100);
  });
});

describe("withBackoff", () => {
  it("returns on the first successful attempt", async () => {
    const fn = vi.fn(async () => "ok");
    await expect(withBackoff(fn, { maxAttempts: 3 })).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries after failures and eventually succeeds", async () => {
    const sleeps: number[] = [];
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("one"))
      .mockRejectedValueOnce(new Error("two"))
      .mockResolvedValueOnce("done");

    const result = await withBackoff(fn, {
      maxAttempts: 3,
      baseDelayMs: 5,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });

    expect(result).toBe("done");
    expect(fn).toHaveBeenCalledTimes(3);
    expect(sleeps).toEqual([5, 10]);
  });

  it("throws BackoffExhaustedError when all attempts fail", async () => {
    const fn = vi.fn(async () => {
      throw new Error("always");
    });

    await expect(
      withBackoff(fn, {
        maxAttempts: 2,
        baseDelayMs: 1,
        sleep: async () => undefined,
      })
    ).rejects.toMatchObject({
      name: "BackoffExhaustedError",
      attempts: 2,
    });
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
