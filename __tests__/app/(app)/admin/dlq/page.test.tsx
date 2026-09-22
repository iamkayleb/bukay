import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  listDeadLetters: vi.fn(),
}));

vi.mock("@/app/(app)/admin/dlq/data", () => ({
  listDeadLetters: state.listDeadLetters,
}));

import AdminDeadLetterPage from "@/app/(app)/admin/dlq/page";

beforeEach(() => {
  state.listDeadLetters.mockReset();
});

describe("AdminDeadLetterPage", () => {
  it("renders dead-letter rows from the data loader", async () => {
    state.listDeadLetters.mockResolvedValue([
      {
        id: "dl-1",
        tenantId: "tenant-1",
        source: "notifications",
        eventType: "booking.created",
        payload: "{}",
        reason: "whatsapp + sms failed",
        createdAt: new Date("2026-09-22T12:00:00.000Z"),
      },
    ]);

    const result = await AdminDeadLetterPage();
    const json = JSON.stringify(result);

    expect(state.listDeadLetters).toHaveBeenCalled();
    expect(json).toContain("Dead-letter queue");
    expect(json).toContain("notifications");
    expect(json).toContain("booking.created");
    expect(json).toContain("whatsapp + sms failed");
    expect(json).toContain("tenant-1");
  });

  it("renders an empty state when there are no rows", async () => {
    state.listDeadLetters.mockResolvedValue([]);

    const result = await AdminDeadLetterPage();
    expect(JSON.stringify(result)).toContain("No dead-letter messages");
  });
});
