import { getTenantId } from "./tenant-context";

export const TENANT_SCOPED_MODELS = [
  "User",
  "Service",
  "Staff",
  "BusinessHour",
  "Client",
  "Booking",
  "Payment",
  "AuditLog",
] as const;

export type TenantScopedModel = (typeof TENANT_SCOPED_MODELS)[number];

const SCOPED = new Set<string>(TENANT_SCOPED_MODELS);

const READ_OPS = new Set([
  "findFirst",
  "findFirstOrThrow",
  "findUnique",
  "findUniqueOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
]);
const WRITE_OPS_WITH_WHERE = new Set(["update", "updateMany", "delete", "deleteMany", "upsert"]);
const WRITE_OPS_WITH_DATA = new Set(["create", "createMany", "upsert"]);

export class TenantScopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TenantScopeError";
  }
}

function whereHasTenant(where: unknown, tenantId: string | undefined): boolean {
  if (!where || typeof where !== "object") return false;
  const w = where as Record<string, unknown>;
  const tid = w.tenantId;
  if (typeof tid === "string") {
    return tenantId === undefined || tid === tenantId;
  }
  if (tid && typeof tid === "object") {
    const eq = (tid as Record<string, unknown>).equals;
    if (typeof eq === "string") {
      return tenantId === undefined || eq === tenantId;
    }
  }
  return false;
}

function dataHasTenant(data: unknown, tenantId: string | undefined): boolean {
  if (!data) return false;
  if (Array.isArray(data)) {
    return data.length > 0 && data.every((row) => dataHasTenant(row, tenantId));
  }
  if (typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  const tid = d.tenantId;
  if (typeof tid === "string") {
    return tenantId === undefined || tid === tenantId;
  }
  return false;
}

export type AssertOptions = {
  model: string;
  operation: string;
  args: unknown;
  tenantId?: string;
};

export function assertTenantScope({ model, operation, args, tenantId }: AssertOptions): void {
  if (!SCOPED.has(model)) return;

  const a = (args ?? {}) as Record<string, unknown>;

  if (READ_OPS.has(operation) || WRITE_OPS_WITH_WHERE.has(operation)) {
    if (!whereHasTenant(a.where, tenantId)) {
      throw new TenantScopeError(
        `Refusing ${model}.${operation}: where clause must include tenantId${tenantId ? ` === "${tenantId}"` : ""}.`
      );
    }
  }

  if (WRITE_OPS_WITH_DATA.has(operation)) {
    const payload = operation === "upsert" ? ((a.create ?? a.update) as unknown) : a.data;
    if (!dataHasTenant(payload, tenantId)) {
      throw new TenantScopeError(
        `Refusing ${model}.${operation}: data must include tenantId${tenantId ? ` === "${tenantId}"` : ""}.`
      );
    }
  }
}

export type TenantGuardConfig = {
  models?: readonly string[];
  getTenantId?: () => string | undefined;
};

export function tenantGuardExtension(config: TenantGuardConfig = {}) {
  const models = new Set(config.models ?? TENANT_SCOPED_MODELS);
  const readTenant = config.getTenantId ?? getTenantId;

  const query: Record<string, Record<string, (params: any) => any>> = {};
  for (const model of Array.from(models)) {
    query[model] = {
      async $allOperations({
        operation,
        args,
        query: run,
      }: {
        operation: string;
        args: unknown;
        query: (args: unknown) => Promise<unknown>;
      }) {
        assertTenantScope({ model, operation, args, tenantId: readTenant() });
        return run(args);
      },
    };
  }

  return { name: "tenant-guard", query };
}

export type ModelLike = Record<string, (args: any) => Promise<any>>;
export type ClientLike = Record<string, ModelLike | unknown>;

export function withTenantGuard<T extends ClientLike>(
  client: T,
  config: TenantGuardConfig = {}
): T {
  const models = new Set(config.models ?? TENANT_SCOPED_MODELS);
  const readTenant = config.getTenantId ?? getTenantId;

  return new Proxy(client, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof prop !== "string" || !models.has(capitalize(prop))) {
        return value;
      }
      const modelName = capitalize(prop);
      const inner = value as ModelLike;
      return new Proxy(inner, {
        get(model, op, modelReceiver) {
          const fn = Reflect.get(model, op, modelReceiver);
          if (typeof op !== "string" || typeof fn !== "function") return fn;
          return async (args: unknown) => {
            assertTenantScope({
              model: modelName,
              operation: op,
              args,
              tenantId: readTenant(),
            });
            return (fn as (a: unknown) => unknown).call(model, args);
          };
        },
      });
    },
  });
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
