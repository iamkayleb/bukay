export type ToolContext = {
  /** Tenant the conversation belongs to; tools may never act outside it. */
  tenantId: string;
};

export type ToolCall = {
  name: string;
  args: Record<string, unknown>;
};

export type ToolResult =
  | { ok: true; status: 200; data: unknown }
  | { ok: false; status: 400 | 403 | 404 | 409 | 500; error: string };

export interface AgentTool {
  readonly name: string;
  readonly description: string;
  execute(args: Record<string, unknown>, ctx: ToolContext): Promise<unknown> | unknown;
}

/** Thrown by a tool to surface a specific HTTP status to the model. */
export class ToolError extends Error {
  readonly status: 400 | 403 | 404 | 409 | 500;

  constructor(status: ToolError["status"], message: string) {
    super(message);
    this.name = "ToolError";
    this.status = status;
  }
}

export class ToolRegistry {
  private readonly tools = new Map<string, AgentTool>();

  register(tool: AgentTool): this {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool already registered: ${tool.name}`);
    }
    this.tools.set(tool.name, tool);
    return this;
  }

  get(name: string): AgentTool | undefined {
    return this.tools.get(name);
  }

  list(): AgentTool[] {
    return [...this.tools.values()];
  }

  /**
   * Dispatches a call. Any `tenantId` in the arguments must match the
   * conversation's tenant, otherwise the call is refused with 403 before the
   * tool runs.
   */
  async call({ name, args }: ToolCall, ctx: ToolContext): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) return { ok: false, status: 404, error: `Unknown tool: ${name}` };

    if (args.tenantId !== undefined && args.tenantId !== ctx.tenantId) {
      return { ok: false, status: 403, error: "Tool call targets a different tenant" };
    }

    try {
      const data = await tool.execute(args, ctx);
      return { ok: true, status: 200, data };
    } catch (err) {
      if (err instanceof ToolError) return { ok: false, status: err.status, error: err.message };
      return { ok: false, status: 500, error: err instanceof Error ? err.message : String(err) };
    }
  }
}

export type AgentMessage =
  | { role: "system" | "user" | "assistant"; content: string }
  | { role: "tool"; name: string; content: string };

export type ModelTurn =
  | { type: "tool_call"; call: ToolCall }
  | { type: "message"; content: string };

/** Anything that can pick the next turn; tests supply a scripted one. */
export interface AgentModel {
  next(messages: readonly AgentMessage[], tools: readonly AgentTool[]): Promise<ModelTurn>;
}

export type AgentRuntimeOptions = {
  model: AgentModel;
  registry: ToolRegistry;
  systemPrompt: string;
  /** Upper bound on tool calls per user message. Defaults to 8. */
  maxToolCalls?: number;
};

export class AgentRuntime {
  private readonly messages: AgentMessage[];
  private readonly maxToolCalls: number;

  constructor(
    private readonly options: AgentRuntimeOptions,
    private readonly ctx: ToolContext
  ) {
    this.messages = [{ role: "system", content: options.systemPrompt }];
    this.maxToolCalls = options.maxToolCalls ?? 8;
  }

  get transcript(): readonly AgentMessage[] {
    return this.messages;
  }

  /** Feeds one user message through the model/tool loop and returns the reply. */
  async send(userMessage: string): Promise<string> {
    this.messages.push({ role: "user", content: userMessage });
    const tools = this.options.registry.list();

    for (let calls = 0; calls <= this.maxToolCalls; calls++) {
      const turn = await this.options.model.next(this.messages, tools);
      if (turn.type === "message") {
        this.messages.push({ role: "assistant", content: turn.content });
        return turn.content;
      }
      const result = await this.options.registry.call(turn.call, this.ctx);
      this.messages.push({ role: "tool", name: turn.call.name, content: JSON.stringify(result) });
    }
    throw new Error(`Agent exceeded ${this.maxToolCalls} tool calls without replying`);
  }
}
