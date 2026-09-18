import { describe, expect, it, vi } from "vitest";

import { IDEMPOTENCY_TTL_MS, IdempotencyStore } from "@/app/lib/idempotency";

function createDelegate() {
  const events = new Map<string, Date>();
  return {
    events,
    delegate: {
      deleteMany: vi.fn(async ({ where }: { where: { key: string; expiresAt: { lte: Date } } }) => {
        const expiresAt = events.get(where.key);
        if (expiresAt && expiresAt <= where.expiresAt.lte) {
          events.delete(where.key);
          return { count: 1 };
        }
        return { count: 0 };
      }),
      create: vi.fn(async ({ data }: { data: { key: string; expiresAt: Date } }) => {
        if (events.has(data.key)) {
          throw Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
        }
        events.set(data.key, data.expiresAt);
      }),
    },
  };
}

describe("idempotency store", () => {
  it("claims an unseen key once", async () => {
    const { delegate } = createDelegate();
    const store = new IdempotencyStore(delegate);

    await expect(store.claim("evt-1")).resolves.toBe(true);
    await expect(store.claim("evt-1")).resolves.toBe(false);
  });

  it("does not confuse distinct keys", async () => {
    const { delegate } = createDelegate();
    const store = new IdempotencyStore(delegate);

    await expect(store.claim("evt-1")).resolves.toBe(true);
    await expect(store.claim("evt-2")).resolves.toBe(true);
  });

  it("allows a claim after the 7-day TTL", async () => {
    const { delegate } = createDelegate();
    const store = new IdempotencyStore(delegate);
    const start = new Date("2026-01-01T00:00:00.000Z");

    await expect(store.claim("evt-1", start)).resolves.toBe(true);
    await expect(
      store.claim("evt-1", new Date(start.getTime() + IDEMPOTENCY_TTL_MS - 1))
    ).resolves.toBe(false);
    await expect(
      store.claim("evt-1", new Date(start.getTime() + IDEMPOTENCY_TTL_MS))
    ).resolves.toBe(true);
  });

  it("retains claims across a simulated process restart", async () => {
    const { delegate } = createDelegate();
    const firstProcess = new IdempotencyStore(delegate);
    await expect(firstProcess.claim("evt-1")).resolves.toBe(true);

    const restartedProcess = new IdempotencyStore(delegate);
    await expect(restartedProcess.claim("evt-1")).resolves.toBe(false);
  });
});
