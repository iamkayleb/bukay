import { AsyncLocalStorage } from "async_hooks";

export interface TenantStore {
  tenantId: string;
  tenantSlug: string;
}

export const tenantContext = new AsyncLocalStorage<TenantStore>();

export function getTenantContext(): TenantStore {
  const store = tenantContext.getStore();
  if (!store) {
    throw new Error(
      "No tenant context — wrap the request handler with tenantContext.run()"
    );
  }
  return store;
}

export function getTenantId(): string {
  return getTenantContext().tenantId;
}

export function getTenantSlug(): string {
  return getTenantContext().tenantSlug;
}

export function getTenantIdOrNull(): string | null {
  return tenantContext.getStore()?.tenantId ?? null;
}

export function getTenantSlugOrNull(): string | null {
  return tenantContext.getStore()?.tenantSlug ?? null;
}
