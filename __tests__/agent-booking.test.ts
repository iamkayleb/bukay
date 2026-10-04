import { describe, expect, it } from "vitest";

import { AGENT_SYSTEM_PROMPT } from "@/app/lib/agent/prompt";
import {
  AgentRuntime,
  ToolRegistry,
  type AgentMessage,
  type AgentModel,
  type ModelTurn,
} from "@/app/lib/agent/runtime";
import { createAvailabilityTool } from "@/app/lib/agent/tools/availability";
import { AGENT_HOLD_TTL_MS, createBookTool } from "@/app/lib/agent/tools/book";
import { SlotHoldStore } from "@/app/lib/slot-hold";

class FakeClock {
  constructor(public t = Date.parse("2026-08-03T08:00:00Z")) {}
  now() {
    return this.t;
  }
}

class ScriptedModel implements AgentModel {
  private i = 0;
  constructor(private readonly turns: ModelTurn[]) {}
  async next(_messages: readonly AgentMessage[]): Promise<ModelTurn> {
    return this.turns[this.i++];
  }
}

function setup(clock = new FakeClock()) {
  const holds = new SlotHoldStore(clock);
  const created: unknown[] = [];
  const registry = new ToolRegistry()
    .register(
      createAvailabilityTool({
        now: () => new Date("2026-08-03T08:00:00Z"),
        loadSchedule: async (tenantId, serviceId) =>
          tenantId === "t1" && serviceId === "cut"
            ? {
                businessHours: [{ dayOfWeek: 1, opensAt: "09:00", closesAt: "11:00" }],
                durationMinutes: 60,
              }
            : null,
      })
    )
    .register(
      createBookTool({
        holds,
        createBooking: async (input) => {
          created.push(input);
          return { id: "b1", status: "confirmed" };
        },
      })
    );
  return { registry, holds, created, clock };
}

describe("agent booking", () => {
  it("scripted conversation reaches a confirmed booking", async () => {
    const { registry, created } = setup();
    const model = new ScriptedModel([
      {
        type: "tool_call",
        call: { name: "check_availability", args: { serviceId: "cut", date: "2026-08-03" } },
      },
      {
        type: "tool_call",
        call: {
          name: "create_booking",
          args: {
            serviceId: "cut",
            startsAt: "2026-08-03T09:00:00.000Z",
            customerName: "Ada",
            customerPhone: "+2348012345678",
          },
        },
      },
      { type: "message", content: "You're booked for 09:00." },
    ]);
    const agent = new AgentRuntime(
      { model, registry, systemPrompt: AGENT_SYSTEM_PROMPT },
      { tenantId: "t1" }
    );

    const reply = await agent.send("Book me a haircut Monday");

    expect(reply).toContain("booked");
    expect(created).toHaveLength(1);
    const tools = agent.transcript.filter((m) => m.role === "tool");
    expect(JSON.parse(tools[0].content).data.slots).toEqual([
      "2026-08-03T09:00:00.000Z",
      "2026-08-03T09:15:00.000Z",
      "2026-08-03T09:30:00.000Z",
      "2026-08-03T09:45:00.000Z",
      "2026-08-03T10:00:00.000Z",
    ]);
    expect(JSON.parse(tools[1].content)).toMatchObject({
      ok: true,
      data: { bookingId: "b1", status: "confirmed" },
    });
  });

  it("returns 403 for a tool call targeting another tenant", async () => {
    const { registry, created } = setup();
    const result = await registry.call(
      {
        name: "create_booking",
        args: {
          tenantId: "t2",
          serviceId: "cut",
          startsAt: "2026-08-03T09:00:00.000Z",
          customerName: "Eve",
          customerPhone: "+2348000000000",
        },
      },
      { tenantId: "t1" }
    );
    expect(result).toMatchObject({ ok: false, status: 403 });
    expect(created).toHaveLength(0);
  });

  it("does not expose another tenant's service", async () => {
    const { registry } = setup();
    const result = await registry.call(
      { name: "check_availability", args: { serviceId: "cut", date: "2026-08-03" } },
      { tenantId: "t2" }
    );
    expect(result).toMatchObject({ ok: false, status: 404 });
  });

  it("releases an unpaid hold after 15 minutes", async () => {
    const { registry, clock } = setup();
    const holds = new SlotHoldStore(clock);
    const pending = new ToolRegistry().register(
      createBookTool({
        holds,
        createBooking: async () => ({ id: "b2", status: "pending_payment" }),
      })
    );
    const call = {
      name: "create_booking",
      args: {
        serviceId: "cut",
        startsAt: "2026-08-03T09:00:00.000Z",
        customerName: "Ada",
        customerPhone: "+2348012345678",
      },
    };
    void registry;

    expect(AGENT_HOLD_TTL_MS).toBe(15 * 60 * 1000);
    expect(await pending.call(call, { tenantId: "t1" })).toMatchObject({ ok: true });
    expect(await pending.call(call, { tenantId: "t1" })).toMatchObject({ ok: false, status: 409 });

    clock.t += AGENT_HOLD_TTL_MS - 1;
    expect(await pending.call(call, { tenantId: "t1" })).toMatchObject({ ok: false, status: 409 });

    clock.t += 2;
    expect(await pending.call(call, { tenantId: "t1" })).toMatchObject({ ok: true });
  });
});
