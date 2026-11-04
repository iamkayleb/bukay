import { describe, expect, it, vi } from "vitest";

import { listDeadLetters } from "@/app/(app)/admin/dlq/data";

describe("listDeadLetters", () => {
  it("returns newest-first rows from the database", async () => {
    const rows = [
      {
        id: "a",
        tenantId: null,
        source: "notifications",
        eventType: "booking.created",
        payload: "{}",
        reason: "failed",
        createdAt: new Date("2026-09-22T12:00:00.000Z"),
      },
    ];
    const findMany = vi.fn(async () => rows);
    const db = { deadLetter: { findMany } };

    await expect(listDeadLetters(db, 50)).resolves.toEqual(rows);
    expect(findMany).toHaveBeenCalledWith({ orderBy: { createdAt: "desc" }, take: 50 });
  });
});
