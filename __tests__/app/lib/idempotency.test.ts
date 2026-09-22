import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  rows: new Map<string, { key: string; expiresAt: Date }>(),
}));

vi.mock("@/app/db/prisma", () => ({
  prisma: {
    idempotencyKey: {
      findUnique: async ({ where: { key } }: { where: { key: string } }) =>
        state.rows.get(key) ?? null,
      upsert: async ({
        where: { key },
        create,
      }: {
        where: { key: string };
        create: { key: string; expiresAt: Date };
      }) => {
        const entry = { key, expiresAt: create.expiresAt };
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
  hasProcessed,
  IDEMPOTENCY_TTL_MS,
  markProcessed,
} from "@/app/lib/idempotency";

beforeEach(async () => {
  await __resetIdempotencyStoreForTests();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("idempotency store", () => {
  it("reports a key as unseen before it is marked processed", async () => {
    expect(await hasProcessed("evt-1")).toBe(false);
  });

  it("reports a key as seen once marked processed", async () => {
    await markProcessed("evt-1");
    expect(await hasProcessed("evt-1")).toBe(true);
  });

  it("does not confuse distinct keys", async () => {
    await markProcessed("evt-1");
    expect(await hasProcessed("evt-2")).toBe(false);
  });

  it("expires entries after the 7-day TTL", async () => {
    const start = Date.parse("2026-01-01T00:00:00.000Z");
    await markProcessed("evt-1", start);

    expect(await hasProcessed("evt-1", start + IDEMPOTENCY_TTL_MS - 1)).toBe(true);
    expect(await hasProcessed("evt-1", start + IDEMPOTENCY_TTL_MS + 1)).toBe(false);
  });

  it("survives a simulated process restart because state lives in the store, not module memory", async () => {
    await markProcessed("evt-1");

    // Re-import the module fresh, as would happen after a process restart.
    // The backing store (the mocked Prisma table) is untouched by this reset,
    // proving durability doesn't depend on any module-level cache.
    vi.resetModules();
    const restarted = await import("@/app/lib/idempotency");

    expect(await restarted.hasProcessed("evt-1")).toBe(true);
  });
});
