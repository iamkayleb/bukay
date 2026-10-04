import type { ToolResult } from "@/app/lib/agent/types";

/**
 * Block a tool call whose arguments name a tenant other than the conversation tenant.
 * Returns HTTP 403; a matching or omitted tenantId is allowed.
 */
export function denyForeignTenant(
  args: Record<string, unknown>,
  tenantId: string
): ToolResult | null {
  const requested = args.tenantId;
  if (typeof requested !== "string") {
    return null;
  }

  const otherTenantId = requested.trim();
  if (!otherTenantId || otherTenantId === tenantId) {
    return null;
  }

  return {
    status: 403,
    ok: false,
    error: "tenant_forbidden",
    message: "A tool call for another tenant is forbidden",
  };
}
