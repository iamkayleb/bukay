import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  rows: new Map<string, { key: string; expiresAt: Date }>(),
}));

vi.mock("@/app/db/prisma", () => ({
  prisma: {
    idempotencyKey: {
      findUnique: async ({ where: { key } }: { where: { key: string } }) =>
        state.rows.get(key) ?? null,
      create: async ({ data }: { data: { key: string; expiresAt: Date } }) => {
        if (state.rows.has(data.key)) {
          throw Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
        }
        const entry = { key: data.key, expiresAt: data.expiresAt };
        state.rows.set(data.key, entry);
        return entry;
      },
      update: async ({
        where: { key },
        data,
      }: {
        where: { key: string };
        data: { expiresAt: Date };
      }) => {
        const entry = { key, expiresAt: data.expiresAt };
        state.rows.set(key, entry);
        return entry;
      },
      deleteMany: async () => {
        state.rows.clear();
      },
    },
  },
}));

import {
  __resetIdempotencyStoreForTests,
  claimIdempotencyKey,
  IDEMPOTENCY_TTL_MS,
} from "@/app/lib/idempotency";

beforeEach(async () => {
  await __resetIdempotencyStoreForTests();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("idempotency store", () => {
  it("claims an unseen key", async () => {
    expect(await claimIdempotencyKey("evt-1")).toBe(true);
  });

  it("refuses to re-claim a key that was already claimed", async () => {
    await claimIdempotencyKey("evt-1");
    expect(await claimIdempotencyKey("evt-1")).toBe(false);
  });

  it("does not confuse distinct keys", async () => {
    await claimIdempotencyKey("evt-1");
    expect(await claimIdempotencyKey("evt-2")).toBe(true);
  });

  it("only lets one of two concurrent claims for the same key win", async () => {
    const [first, second] = await Promise.all([
      claimIdempotencyKey("evt-1"),
      claimIdempotencyKey("evt-1"),
    ]);

    expect([first, second].filter(Boolean)).toHaveLength(1);
  });

  it("re-claims a key after the 7-day TTL has expired", async () => {
    const start = Date.parse("2026-01-01T00:00:00.000Z");
    await claimIdempotencyKey("evt-1", start);

    expect(await claimIdempotencyKey("evt-1", start + IDEMPOTENCY_TTL_MS - 1)).toBe(false);
    expect(await claimIdempotencyKey("evt-1", start + IDEMPOTENCY_TTL_MS + 1)).toBe(true);
  });

  it("survives a simulated process restart because state lives in the store, not module memory", async () => {
    await claimIdempotencyKey("evt-1");

    // Re-import the module fresh, as would happen after a process restart.
    // The backing store (the mocked Prisma table) is untouched by this reset,
    // proving durability doesn't depend on any module-level cache.
    vi.resetModules();
    const restarted = await import("@/app/lib/idempotency");

    expect(await restarted.claimIdempotencyKey("evt-1")).toBe(false);
  });
});
