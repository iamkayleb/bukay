import { denyForeignTenant } from "@/app/lib/agent/guard";
import {
  AgentHandoff,
  HANDOFF_HALTED_REPLY,
  HANDOFF_REPLY,
  isHandoffCommand,
  recordOwnerAlert,
  type OwnerAlerter,
} from "@/app/lib/agent/handoff";
import { BOOKING_AGENT_SYSTEM_PROMPT } from "@/app/lib/agent/prompt";
import type {
  AgentTool,
  ChatMessage,
  JsonObject,
  PlannerTurn,
  ToolContext,
  ToolResult,
  TurnPlanner,
} from "@/app/lib/agent/types";
import { createBookingTool } from "@/app/lib/agent/tools/book";
import { lookupAvailabilityTool } from "@/app/lib/agent/tools/availability";

const MAX_TOOL_STEPS = 8;

export class ToolRegistry {
  private readonly tools = new Map<string, AgentTool>();

  register(tool: AgentTool): void {
    this.tools.set(tool.name, tool);
  }

  get(name: string): AgentTool | undefined {
    return this.tools.get(name);
  }

  list(): AgentTool[] {
    return [...this.tools.values()];
  }

  /**
   * Invoke a registered tool for the conversation tenant.
   * A tool call that names another tenant returns HTTP 403 before the tool runs.
   */
  async call(name: string, args: JsonObject, context: ToolContext): Promise<ToolResult> {
    const denied = denyForeignTenant(args, context.tenantId);
    if (denied) {
      return denied;
    }

    const tool = this.tools.get(name);
    if (!tool) {
      return {
        status: 404,
        ok: false,
        error: "unknown_tool",
        message: `Unknown tool: ${name}`,
      };
    }

    return tool.execute(args, context);
  }
}

export function createDefaultToolRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  registry.register(lookupAvailabilityTool);
  registry.register(createBookingTool);
  return registry;
}

export type AgentRuntimeOptions = {
  tenantId: string;
  planner: TurnPlanner;
  conversationId?: string;
  now?: () => Date;
  systemPrompt?: string;
  alertOwner?: OwnerAlerter;
  failureLimit?: number;
};

export class AgentRuntime {
  private readonly registry: ToolRegistry;
  private readonly options: AgentRuntimeOptions;
  private readonly messages: ChatMessage[];
  private readonly handoff: AgentHandoff;

  constructor(registry: ToolRegistry, options: AgentRuntimeOptions) {
    this.registry = registry;
    this.options = options;
    this.handoff = new AgentHandoff(
      {
        tenantId: options.tenantId,
        conversationId: options.conversationId ?? "conversation",
      },
      options.alertOwner ?? recordOwnerAlert,
      options.failureLimit
    );
    this.messages = [
      {
        role: "system",
        content: options.systemPrompt ?? BOOKING_AGENT_SYSTEM_PROMPT,
      },
    ];
  }

  get halted(): boolean {
    return this.handoff.halted;
  }

  get transcript(): readonly ChatMessage[] {
    return this.messages;
  }

  async send(userText: string): Promise<string> {
    if (this.handoff.halted) {
      this.messages.push({ role: "user", content: userText });
      this.messages.push({ role: "assistant", content: HANDOFF_HALTED_REPLY });
      return HANDOFF_HALTED_REPLY;
    }

    if (isHandoffCommand(userText)) {
      this.messages.push({ role: "user", content: userText });
      await this.handoff.request(userText);
      this.messages.push({ role: "assistant", content: HANDOFF_REPLY });
      return HANDOFF_REPLY;
    }

    this.messages.push({ role: "user", content: userText });

    for (let step = 0; step < MAX_TOOL_STEPS; step += 1) {
      const turn = await this.options.planner({
        messages: this.messages,
        tools: this.registry.list(),
      });
      const reply = await this.applyTurn(turn);
      if (reply !== null) {
        return reply;
      }
    }

    const fallback = "I could not finish that booking.";
    this.messages.push({ role: "assistant", content: fallback });
    return fallback;
  }

  private async applyTurn(turn: PlannerTurn): Promise<string | null> {
    const calls = turn.toolCalls ?? [];
    if (calls.length === 0) {
      const content = turn.content ?? "";
      this.messages.push({ role: "assistant", content });
      return content;
    }

    if (turn.content) {
      this.messages.push({ role: "assistant", content: turn.content });
    }

    for (const call of calls) {
      const result = await this.registry.call(call.name, call.arguments, this.toolContext());
      this.messages.push({
        role: "tool",
        name: call.name,
        content: JSON.stringify(result),
      });

      if (result.ok) {
        this.handoff.noteSuccess();
        continue;
      }

      const lastUser = [...this.messages].reverse().find((message) => message.role === "user");
      const handedOff = await this.handoff.noteFailure(lastUser?.content ?? "");
      if (handedOff) {
        this.messages.push({ role: "assistant", content: HANDOFF_REPLY });
        return HANDOFF_REPLY;
      }
    }

    return null;
  }

  private toolContext(): ToolContext {
    return {
      tenantId: this.options.tenantId,
      conversationId: this.options.conversationId ?? "conversation",
      now: this.options.now?.() ?? new Date(),
    };
  }
}

export function createBookingAgent(options: AgentRuntimeOptions): AgentRuntime {
  return new AgentRuntime(createDefaultToolRegistry(), options);
}
