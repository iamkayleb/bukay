import { denyForeignTenant } from "@/app/lib/agent/guard";
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
};

export class AgentRuntime {
  private readonly registry: ToolRegistry;
  private readonly options: AgentRuntimeOptions;
  private readonly messages: ChatMessage[];

  constructor(registry: ToolRegistry, options: AgentRuntimeOptions) {
    this.registry = registry;
    this.options = options;
    this.messages = [
      {
        role: "system",
        content: options.systemPrompt ?? BOOKING_AGENT_SYSTEM_PROMPT,
      },
    ];
  }

  get transcript(): readonly ChatMessage[] {
    return this.messages;
  }

  async send(userText: string): Promise<string> {
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
