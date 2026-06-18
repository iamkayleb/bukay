import { AsyncLocalStorage } from "node:async_hooks";

export interface TenantContext {
  tenantId: string;
}

export const tenantContext = new AsyncLocalStorage<TenantContext>();

export function runWithTenantContext<T>(context: TenantContext, callback: () => T): T {
  const tenantId = context.tenantId.trim();
  if (!tenantId) {
    throw new Error("Tenant context requires a tenantId");
  }

  return tenantContext.run({ tenantId }, callback);
}

export function requireTenantContext(): TenantContext {
  const context = tenantContext.getStore();
  if (!context) {
    throw new Error("Tenant context is not available");
  }

  return context;
}
