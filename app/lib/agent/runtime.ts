import { z } from "zod";

import { runWithTenant } from "@/app/lib/tenant-context";
import { runWithTenantContext } from "@/app/tenancy/tenant-context";

/** Identity and request state shared by every tool invocation in a conversation. */
export interface AgentRuntimeContext {
  tenantId: string;
  sessionId: string;
}

/** A capability the conversational agent may invoke. */
export interface AgentTool<Input, Output> {
  name: string;
  description: string;
  inputSchema: z.ZodType<Input>;
  execute(input: Input, context: AgentRuntimeContext): Promise<Output>;
}

/** Safe metadata suitable for presenting to an LLM or another agent client. */
export interface AgentToolDefinition {
  name: string;
  description: string;
}

export class AgentToolNotFoundError extends Error {
  constructor(name: string) {
    super(`Unknown agent tool: ${name}`);
    this.name = "AgentToolNotFoundError";
  }
}

export class AgentToolInputError extends Error {
  constructor(name: string, issues: z.ZodIssue[]) {
    super(`Invalid input for agent tool: ${name}`);
    this.name = "AgentToolInputError";
    this.issues = issues;
  }

  readonly issues: z.ZodIssue[];
}

/** Raised when a tool invocation is not bound to one concrete tenant. */
export class AgentTenantScopeError extends Error {
  constructor() {
    super("Agent tool calls require a non-empty tenantId.");
    this.name = "AgentTenantScopeError";
  }
}

/**
 * Validate and normalize the trusted conversation scope before a tool runs.
 *
 * Tenant identity comes from the conversation context, never from model input.
 * Keeping this check at the runtime boundary makes it apply to every registered
 * tool, including tools added after the runtime itself.
 */
export function assertAgentTenantScope(
  context: AgentRuntimeContext | null | undefined
): AgentRuntimeContext {
  // Runtime callers may originate at an untyped channel boundary. Do not let a
  // malformed context turn this security check into a TypeError that callers
  // could accidentally treat as a retryable tool failure.
  const tenantId = typeof context?.tenantId === "string" ? context.tenantId.trim() : "";
  if (!tenantId) {
    throw new AgentTenantScopeError();
  }

  return { ...context, tenantId };
}

type AnyAgentTool = AgentTool<unknown, unknown>;

/** Preserve a tool's input and output types while registering it with the runtime. */
export function defineAgentTool<Input, Output>(
  tool: AgentTool<Input, Output>
): AgentTool<Input, Output> {
  return tool;
}

/**
 * Executes the explicitly registered tools for one tenant-bound conversation.
 *
 * The runtime deliberately has no fallback for unknown tool names: a model may
 * only use capabilities that the application registered. Each invocation also
 * enters tenant context before calling a tool, so data access can use the
 * repository's tenant guard instead of trusting model-supplied tenant values.
 */
export class AgentRuntime {
  private readonly tools: ReadonlyMap<string, AnyAgentTool>;

  constructor(tools: readonly AnyAgentTool[]) {
    const registry = new Map<string, AnyAgentTool>();
    for (const tool of tools) {
      if (!tool.name.trim()) {
        throw new Error("Agent tool names must not be empty.");
      }
      if (registry.has(tool.name)) {
        throw new Error(`Agent tool is registered more than once: ${tool.name}`);
      }
      registry.set(tool.name, tool);
    }
    this.tools = registry;
  }

  definitions(): AgentToolDefinition[] {
    return [...this.tools.values()].map(({ name, description }) => ({ name, description }));
  }

  async invoke<Output = unknown>(
    name: string,
    input: unknown,
    context: AgentRuntimeContext
  ): Promise<Output> {
    const tool = this.tools.get(name);
    if (!tool) throw new AgentToolNotFoundError(name);

    const scopedContext = assertAgentTenantScope(context);

    const parsed = tool.inputSchema.safeParse(input);
    if (!parsed.success) {
      throw new AgentToolInputError(name, parsed.error.issues);
    }

    return runWithTenant({ tenantId: scopedContext.tenantId }, () =>
      runWithTenantContext({ tenantId: scopedContext.tenantId }, () =>
        tool.execute(parsed.data, scopedContext)
      )
    ) as Promise<Output>;
  }
}

export function createAgentRuntime(tools: readonly AnyAgentTool[]): AgentRuntime {
  return new AgentRuntime(tools);
}
