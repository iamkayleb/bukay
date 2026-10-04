import { describe, expect, it } from "vitest";

import { AgentRuntime } from "@/app/lib/agent/runtime";
import {
  AgentToolForbiddenError,
  createAvailabilityTool,
  type AvailabilityToolRepository,
} from "@/app/lib/agent/tools/availability";

function createRepository(): AvailabilityToolRepository {
  return {
    findService: async (tenantId, serviceId) =>
      tenantId === "tenant-1" && serviceId === "service-1"
        ? { id: "service-1", durationMinutes: 30 }
        : null,
    listBusinessHours: async (tenantId) => {
      expect(tenantId).toBe("tenant-1");
      return [{ dayOfWeek: 1, opensAt: "09:00", closesAt: "10:00", isClosed: false }];
    },
    listBookings: async (tenantId) => {
      expect(tenantId).toBe("tenant-1");
      return [];
    },
  };
}

describe("lookup_availability agent tool", () => {
  it("returns open slots only for the active conversation tenant", async () => {
    const runtime = new AgentRuntime([
      createAvailabilityTool(createRepository(), () => new Date("2026-09-01T00:00:00.000Z")),
    ]);

    await expect(
      runtime.invoke(
        "lookup_availability",
        {
          serviceId: "service-1",
          startDate: "2026-09-14T00:00:00.000Z",
          endDate: "2026-09-14T00:00:00.000Z",
        },
        { tenantId: "tenant-1", sessionId: "chat-1" }
      )
    ).resolves.toEqual({
      serviceId: "service-1",
      slots: ["2026-09-14T09:00:00.000Z", "2026-09-14T09:30:00.000Z"],
    });
  });

  it("rejects a request attempting to select another tenant with a 403 error", async () => {
    const runtime = new AgentRuntime([createAvailabilityTool(createRepository())]);

    await expect(
      runtime.invoke(
        "lookup_availability",
        {
          tenantId: "tenant-2",
          serviceId: "service-1",
          startDate: "2026-09-14T00:00:00.000Z",
          endDate: "2026-09-14T00:00:00.000Z",
        },
        { tenantId: "tenant-1", sessionId: "chat-1" }
      )
    ).rejects.toMatchObject({ status: 403 } satisfies Partial<AgentToolForbiddenError>);
  });
});
