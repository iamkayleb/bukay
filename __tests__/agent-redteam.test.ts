import { describe, expect, it, vi } from "vitest";
import { ToolRegistry, type AgentTool } from "@/app/lib/agent/runtime";

function setup() {
  const execute = vi.fn(async () => ({ booked: true }));
  const tool: AgentTool = { name: "book", description: "book a slot", execute };
  return { execute, registry: new ToolRegistry().register(tool) };
}

describe("agent red team: cross-tenant tool calls", () => {
  const ctx = { tenantId: "tenant-a" };
  const attacks: Record<string, Record<string, unknown>> = {
    "top-level tenantId": { tenantId: "tenant-b" },
    "snake_case tenant_id": { tenant_id: "tenant-b" },
    "tenant key": { tenant: "tenant-b" },
    "mixed-case key": { TenantID: "tenant-b" },
    "nested object": { booking: { customer: { tenantId: "tenant-b" } } },
    "inside array": { items: [{ ok: 1 }, { tenantId: "tenant-b" }] },
    "null tenant": { tenantId: null },
    "empty tenant": { tenantId: "" },
  };

  for (const [label, args] of Object.entries(attacks)) {
    it(`blocks ${label}`, async () => {
      const { registry, execute } = setup();
      const res = await registry.call({ name: "book", args }, ctx);
      expect(res).toMatchObject({ ok: false, status: 403 });
      expect(execute).not.toHaveBeenCalled();
    });
  }

  it("blocks calls with no tenant scope in context", async () => {
    const { registry, execute } = setup();
    const res = await registry.call({ name: "book", args: {} }, { tenantId: "" });
    expect(res).toMatchObject({ ok: false, status: 403 });
    expect(execute).not.toHaveBeenCalled();
  });

  it("allows calls scoped to the conversation tenant", async () => {
    const { registry, execute } = setup();
    const res = await registry.call(
      { name: "book", args: { tenantId: "tenant-a", nested: { tenant_id: "tenant-a" } } },
      ctx
    );
    expect(res).toMatchObject({ ok: true, status: 200 });
    expect(execute).toHaveBeenCalledTimes(1);
  });
});
