import { describe, expect, it, vi } from "vitest";

import { advisoryLockKey, withPostgresAdvisoryLock } from "@/app/lib/locks";

describe("Postgres advisory locks", () => {
  it("maps a resource to stable signed 32-bit lock keys", () => {
    expect(advisoryLockKey("reminder:booking-123")).toStrictEqual(
      advisoryLockKey("reminder:booking-123")
    );
    expect(advisoryLockKey("reminder:booking-123")).not.toStrictEqual(
      advisoryLockKey("reminder:booking-456")
    );
    for (const key of advisoryLockKey("reminder:booking-123")) {
      expect(key).toBeGreaterThanOrEqual(-(2 ** 31));
      expect(key).toBeLessThan(2 ** 31);
    }
  });

  it("acquires a transaction-scoped lock before running the work", async () => {
    const transaction = { $executeRaw: vi.fn().mockResolvedValue(undefined) };
    const client = {
      $transaction: vi.fn(async (operation) => operation(transaction)),
    };
    const work = vi.fn().mockResolvedValue("sent");

    await expect(withPostgresAdvisoryLock(client, "reminder:booking-123", work)).resolves.toBe(
      "sent"
    );

    expect(transaction.$executeRaw).toHaveBeenCalledTimes(1);
    expect(work).toHaveBeenCalledWith(transaction);
    expect(transaction.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
      work.mock.invocationCallOrder[0]
    );
  });
});
