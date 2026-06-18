import { AsyncLocalStorage } from "node:async_hooks";

export type TenantContext = {
  tenantId: string;
  tenantSlug?: string;
};

const storage = new AsyncLocalStorage<TenantContext>();

export function runWithTenant<T>(ctx: TenantContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

export function getTenantContext(): TenantContext | undefined {
  return storage.getStore();
}

export function getTenantId(): string | undefined {
  return storage.getStore()?.tenantId;
}

export function requireTenantId(): string {
  const id = getTenantId();
  if (!id) {
    throw new Error("No tenant in context. Call runWithTenant() before issuing tenant-scoped queries.");
  }
  return id;
}
