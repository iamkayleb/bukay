import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  __resetIdempotencyStoreForTests,
  hasProcessed,
  IDEMPOTENCY_TTL_MS,
  markProcessed,
} from "@/app/lib/idempotency";

beforeEach(() => {
  __resetIdempotencyStoreForTests();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("idempotency store", () => {
  it("reports a key as unseen before it is marked processed", () => {
    expect(hasProcessed("evt-1")).toBe(false);
  });

  it("reports a key as seen once marked processed", () => {
    markProcessed("evt-1");
    expect(hasProcessed("evt-1")).toBe(true);
  });

  it("does not confuse distinct keys", () => {
    markProcessed("evt-1");
    expect(hasProcessed("evt-2")).toBe(false);
  });

  it("expires entries after the 7-day TTL", () => {
    const start = Date.parse("2026-01-01T00:00:00.000Z");
    markProcessed("evt-1", start);

    expect(hasProcessed("evt-1", start + IDEMPOTENCY_TTL_MS - 1)).toBe(true);
    expect(hasProcessed("evt-1", start + IDEMPOTENCY_TTL_MS + 1)).toBe(false);
  });
});
