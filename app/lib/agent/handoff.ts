/** Consecutive failed tool calls that hand the conversation to a person. */
export const REPEATED_FAILURE_LIMIT = 3;

export const HANDOFF_REPLY =
  "I've handed this conversation to the business owner. A person will follow up.";

export const HANDOFF_HALTED_REPLY =
  "This conversation is with a person now. I won't take further booking actions.";

const HANDOFF_COMMANDS = new Set([
  "/handoff",
  "handoff",
  "human",
  "talk to a human",
  "talk to a person",
]);

export type HandoffReason = "command" | "repeated_failure";

export type OwnerAlert = {
  tenantId: string;
  conversationId: string;
  reason: HandoffReason;
  customerMessage: string;
};

export type OwnerAlerter = (alert: OwnerAlert) => void | Promise<void>;

const ownerAlerts: OwnerAlert[] = [];

/** Record an owner alert in memory. Tests and the default alerter read this log. */
export function recordOwnerAlert(alert: OwnerAlert): void {
  ownerAlerts.push(alert);
}

export function listOwnerAlerts(tenantId?: string): readonly OwnerAlert[] {
  if (!tenantId) return [...ownerAlerts];
  return ownerAlerts.filter((alert) => alert.tenantId === tenantId);
}

export function __resetOwnerAlertsForTests(): void {
  ownerAlerts.length = 0;
}

/**
 * True when the customer message is the handoff command.
 * Matching is exact after trim and case-folding, so ordinary booking text is left alone.
 */
export function isHandoffCommand(text: string): boolean {
  const normalized = text
    .trim()
    .toLowerCase()
    .replace(/[.!]+$/g, "")
    .trim();
  return HANDOFF_COMMANDS.has(normalized);
}

/**
 * Stops the agent after an explicit handoff command or repeated tool failure,
 * and alerts the tenant owner once.
 */
export class AgentHandoff {
  halted = false;
  private failures = 0;
  private alerted = false;

  constructor(
    private readonly scope: { tenantId: string; conversationId: string },
    private readonly alertOwner: OwnerAlerter = recordOwnerAlert,
    private readonly failureLimit = REPEATED_FAILURE_LIMIT
  ) {}

  async request(customerMessage: string): Promise<void> {
    await this.halt("command", customerMessage);
  }

  /** Returns true when this failure trips the handoff. */
  async noteFailure(customerMessage: string): Promise<boolean> {
    this.failures += 1;
    if (this.failures < this.failureLimit) return false;
    await this.halt("repeated_failure", customerMessage);
    return true;
  }

  noteSuccess(): void {
    this.failures = 0;
  }

  private async halt(reason: HandoffReason, customerMessage: string): Promise<void> {
    this.halted = true;
    if (this.alerted) return;
    this.alerted = true;
    await this.alertOwner({
      tenantId: this.scope.tenantId,
      conversationId: this.scope.conversationId,
      reason,
      customerMessage,
    });
  }
}
