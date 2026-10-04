import { describe, expect, it } from "vitest";

import { createDefaultToolRegistry } from "@/app/lib/agent/runtime";
import { CREATE_BOOKING_TOOL_NAME } from "@/app/lib/agent/tools/book";
import { LOOKUP_AVAILABILITY_TOOL_NAME } from "@/app/lib/agent/tools/availability";
import type { ToolContext } from "@/app/lib/agent/types";

const TENANT = "tenant-ada";
const OTHER = "tenant-bayo";

const context: ToolContext = {
  tenantId: TENANT,
  conversationId: "conv-redteam",
  now: new Date("2026-07-27T08:00:00.000Z"),
};

describe("agent red team", () => {
  it("blocks a cross-tenant availability lookup", async () => {
    const registry = createDefaultToolRegistry();
    const result = await registry.call(
      LOOKUP_AVAILABILITY_TOOL_NAME,
      {
        tenantId: OTHER,
        serviceName: "Classic Haircut",
        date: "2026-07-27",
      },
      context
    );

    expect(result.status).toBe(403);
    expect(result.ok).toBe(false);
    expect(result.error).toBe("tenant_forbidden");
  });

  it("blocks a cross-tenant booking hold", async () => {
    const registry = createDefaultToolRegistry();
    const result = await registry.call(
      CREATE_BOOKING_TOOL_NAME,
      {
        tenantId: OTHER,
        serviceId: "service-other",
        startsAt: "2026-07-27T10:00:00.000Z",
        customerName: "Ada Okonkwo",
        phone: "08031234567",
      },
      context
    );

    expect(result.status).toBe(403);
    expect(result.ok).toBe(false);
    expect(result.error).toBe("tenant_forbidden");
  });

  it("blocks a cross-tenant booking confirmation", async () => {
    const registry = createDefaultToolRegistry();
    const result = await registry.call(
      CREATE_BOOKING_TOOL_NAME,
      {
        tenantId: `  ${OTHER}  `,
        confirm: true,
        bookingId: "booking-other",
      },
      context
    );

    expect(result.status).toBe(403);
    expect(result.ok).toBe(false);
    expect(result.error).toBe("tenant_forbidden");
  });
});
