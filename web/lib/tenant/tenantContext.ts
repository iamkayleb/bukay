import { AsyncLocalStorage } from "async_hooks";

export interface TenantStore {
  tenantId: string;
  tenantSlug: string;
}

export const tenantContext = new AsyncLocalStorage<TenantStore>();

export function getTenantId(): string {
  const store = tenantContext.getStore();
  if (!store) {
    throw new Error(
      "No tenant context — wrap the request handler with tenantContext.run()"
    );
  }
  return store.tenantId;
}

export function getTenantIdOrNull(): string | null {
  return tenantContext.getStore()?.tenantId ?? null;
}
