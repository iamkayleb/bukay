import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import {
  AgentRuntime,
  AgentTenantScopeError,
  AgentToolInputError,
  AgentToolNotFoundError,
  defineAgentTool,
} from "@/app/lib/agent/runtime";
import { getTenantId } from "@/app/lib/tenant-context";
import { requireTenantContext } from "@/app/tenancy/tenant-context";

describe("AgentRuntime", () => {
  it("lists registered tools and invokes them in the conversation tenant context", async () => {
    const runtime = new AgentRuntime([
      defineAgentTool({
        name: "lookup_availability",
        description: "Find a service's open times.",
        inputSchema: z.object({ serviceId: z.string().min(1) }),
        async execute(input) {
          return {
            serviceId: input.serviceId,
            legacyTenantId: getTenantId(),
            prismaTenantId: requireTenantContext().tenantId,
          };
        },
      }),
    ]);

    expect(runtime.definitions()).toEqual([
      { name: "lookup_availability", description: "Find a service's open times." },
    ]);
    await expect(
      runtime.invoke(
        "lookup_availability",
        { serviceId: "service-1" },
        {
          tenantId: "tenant-1",
          sessionId: "session-1",
        }
      )
    ).resolves.toEqual({
      serviceId: "service-1",
      legacyTenantId: "tenant-1",
      prismaTenantId: "tenant-1",
    });
  });

  it("rejects unknown tools and invalid input before a tool can execute", async () => {
    const runtime = new AgentRuntime([
      defineAgentTool({
        name: "lookup_availability",
        description: "Find a service's open times.",
        inputSchema: z.object({ serviceId: z.string().min(1) }),
        execute: async () => "unreachable",
      }),
    ]);
    const context = { tenantId: "tenant-1", sessionId: "session-1" };

    await expect(runtime.invoke("book", {}, context)).rejects.toBeInstanceOf(
      AgentToolNotFoundError
    );
    await expect(runtime.invoke("lookup_availability", {}, context)).rejects.toBeInstanceOf(
      AgentToolInputError
    );
  });

  it("rejects duplicate names so a tool cannot silently replace another one", () => {
    const tool = defineAgentTool({
      name: "lookup_availability",
      description: "Find a service's open times.",
      inputSchema: z.object({}),
      execute: async () => null,
    });

    expect(() => new AgentRuntime([tool, tool])).toThrow("registered more than once");
  });

  it("rejects an invocation without tenant scope before the tool executes", async () => {
    const execute = vi.fn(async () => "unreachable");
    const runtime = new AgentRuntime([
      defineAgentTool({
        name: "lookup_availability",
        description: "Find a service's open times.",
        inputSchema: z.object({}),
        execute,
      }),
    ]);

    await expect(
      runtime.invoke("lookup_availability", {}, { tenantId: "  ", sessionId: "session-1" })
    ).rejects.toBeInstanceOf(AgentTenantScopeError);
    expect(execute).not.toHaveBeenCalled();
  });
});
