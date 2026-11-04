import { describe, expect, it, beforeEach } from "vitest";

import {
  HANDOFF_HALTED_REPLY,
  HANDOFF_REPLY,
  REPEATED_FAILURE_LIMIT,
  __resetOwnerAlertsForTests,
  isHandoffCommand,
  listOwnerAlerts,
} from "@/app/lib/agent/handoff";
import { createBookingAgent } from "@/app/lib/agent/runtime";
import type { TurnPlanner } from "@/app/lib/agent/types";

const TENANT = "tenant-ada";

beforeEach(() => {
  __resetOwnerAlertsForTests();
});

describe("handoff command", () => {
  it("recognizes the handoff command and ignores ordinary booking text", () => {
    expect(isHandoffCommand("/handoff")).toBe(true);
    expect(isHandoffCommand("  Handoff! ")).toBe(true);
    expect(isHandoffCommand("talk to a human")).toBe(true);
    expect(isHandoffCommand("I'd like a haircut tomorrow")).toBe(false);
  });

  it("halts the agent and alerts the owner", async () => {
    let plannerCalls = 0;
    const planner: TurnPlanner = () => {
      plannerCalls += 1;
      return { content: "I can book that." };
    };
    const agent = createBookingAgent({
      tenantId: TENANT,
      conversationId: "conv-handoff",
      planner,
    });

    const reply = await agent.send("/handoff");
    expect(reply).toBe(HANDOFF_REPLY);
    expect(agent.halted).toBe(true);
    expect(plannerCalls).toBe(0);
    expect(listOwnerAlerts(TENANT)).toEqual([
      {
        tenantId: TENANT,
        conversationId: "conv-handoff",
        reason: "command",
        customerMessage: "/handoff",
      },
    ]);

    const followUp = await agent.send("Book me a haircut anyway");
    expect(followUp).toBe(HANDOFF_HALTED_REPLY);
    expect(plannerCalls).toBe(0);
    expect(listOwnerAlerts(TENANT)).toHaveLength(1);
  });

  it("hands off after repeated tool failures and alerts the owner", async () => {
    const planner: TurnPlanner = () => ({
      toolCalls: [
        {
          name: "lookup_availability",
          arguments: { tenantId: "tenant-other", serviceName: "Cut", date: "2026-07-27" },
        },
      ],
    });
    const agent = createBookingAgent({
      tenantId: TENANT,
      conversationId: "conv-failures",
      planner,
    });

    const reply = await agent.send("Book a cut on another business");
    expect(reply).toBe(HANDOFF_REPLY);
    expect(agent.halted).toBe(true);

    const toolMessages = agent.transcript.filter((message) => message.role === "tool");
    expect(toolMessages).toHaveLength(REPEATED_FAILURE_LIMIT);
    for (const message of toolMessages) {
      expect(JSON.parse(message.content)).toMatchObject({ status: 403, ok: false });
    }

    expect(listOwnerAlerts(TENANT)).toEqual([
      {
        tenantId: TENANT,
        conversationId: "conv-failures",
        reason: "repeated_failure",
        customerMessage: "Book a cut on another business",
      },
    ]);

    const followUp = await agent.send("try again");
    expect(followUp).toBe(HANDOFF_HALTED_REPLY);
    expect(agent.transcript.filter((message) => message.role === "tool")).toHaveLength(
      REPEATED_FAILURE_LIMIT
    );
  });
});
