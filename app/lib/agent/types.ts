export type JsonObject = Record<string, unknown>;

export type ToolContext = {
  tenantId: string;
  conversationId: string;
  now: Date;
};

/** Tool outcome. `status` is an HTTP status code. */
export type ToolResult = {
  status: number;
  ok: boolean;
  error?: string;
  message?: string;
  data?: unknown;
};

export type AgentTool = {
  name: string;
  description: string;
  parameters: JsonObject;
  execute: (args: JsonObject, context: ToolContext) => Promise<ToolResult>;
};

export type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  name?: string;
};

export type ToolCall = {
  name: string;
  arguments: JsonObject;
};

export type PlannerTurn = {
  content?: string;
  toolCalls?: ToolCall[];
};

export type TurnPlanner = (state: {
  messages: ChatMessage[];
  tools: AgentTool[];
}) => PlannerTurn | Promise<PlannerTurn>;
