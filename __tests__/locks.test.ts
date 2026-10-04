import { describe, expect, it } from "vitest";
import { withAdvisoryLock, type AdvisoryLockClient } from "@/app/lib/locks";

// Fake client that models xact-scoped advisory locks: a key is held until the
// transaction callback settles.
function fakeClient(): AdvisoryLockClient {
  const held = new Set<string>();
  return {
    async $transaction(fn) {
      let key = "";
      const tx = {
        async $queryRaw(_q: TemplateStringsArray, ...values: unknown[]) {
          key = String(values[0]);
          if (held.has(key)) return [{ locked: false }] as never;
          held.add(key);
          return [{ locked: true }] as never;
        },
      };
      try {
        return await fn(tx);
      } finally {
        held.delete(key);
      }
    },
  };
}

describe("withAdvisoryLock", () => {
  it("runs fn once for concurrent callers and releases afterwards", async () => {
    const client = fakeClient();
    let runs = 0;
    const work = async () => {
      runs += 1;
      await new Promise((r) => setTimeout(r, 10));
      return "ok";
    };
    const [a, b] = await Promise.all([
      withAdvisoryLock(client, "reminders", work),
      withAdvisoryLock(client, "reminders", work),
    ]);
    expect([a.acquired, b.acquired].sort()).toEqual([false, true]);
    expect(runs).toBe(1);

    const again = await withAdvisoryLock(client, "reminders", work);
    expect(again).toEqual({ acquired: true, value: "ok" });
  });

  it("releases the lock when fn throws", async () => {
    const client = fakeClient();
    await expect(
      withAdvisoryLock(client, "k", async () => {
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");
    expect((await withAdvisoryLock(client, "k", async () => 1)).acquired).toBe(true);
  });
});
