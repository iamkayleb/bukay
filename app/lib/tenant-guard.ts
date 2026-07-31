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

function normalizedTenantIdValue(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const eq = (value as Record<string, unknown>).equals;
    if (typeof eq === "string") return eq;
  }
  return undefined;
}

/**
 * Walk `where` (including nested AND/OR) and return the tenantId if — and only
 * if — the clause provably restricts results to a single tenant. Returns
 * undefined when the clause could match another tenant's rows.
 *
 * AND: any branch that supplies the tenantId narrows the whole conjunction.
 * OR: every branch must independently pin the same tenantId, otherwise a
 *     branch without a tenantId filter would leak cross-tenant data.
 */
function tenantIdInWhere(where: unknown): string | undefined {
  if (!where || typeof where !== "object" || Array.isArray(where)) return undefined;
  const w = where as Record<string, unknown>;

  const direct = normalizedTenantIdValue(w.tenantId);
  if (direct !== undefined) return direct;

  if (Array.isArray(w.AND)) {
    for (const branch of w.AND) {
      const found = tenantIdInWhere(branch);
      if (found !== undefined) return found;
    }
  }

  if (Array.isArray(w.OR) && w.OR.length > 0) {
    let candidate: string | undefined;
    for (const branch of w.OR) {
      const found = tenantIdInWhere(branch);
      if (found === undefined) return undefined;
      if (candidate === undefined) candidate = found;
      else if (candidate !== found) return undefined;
    }
    return candidate;
  }

  return undefined;
}

function whereHasTenant(where: unknown, tenantId: string | undefined): boolean {
  const found = tenantIdInWhere(where);
  if (found === undefined) return false;
  return tenantId === undefined || found === tenantId;
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

function dataTenantOkOrAbsent(data: unknown, tenantId: string | undefined): boolean {
  if (!data || typeof data !== "object" || Array.isArray(data)) return true;
  const d = data as Record<string, unknown>;
  const tid = d.tenantId;
  if (tid === undefined) return true;
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
    if (operation === "upsert") {
      if (!dataHasTenant(a.create, tenantId)) {
        throw new TenantScopeError(
          `Refusing ${model}.upsert: create payload must include tenantId${tenantId ? ` === "${tenantId}"` : ""}.`
        );
      }
      if (!dataTenantOkOrAbsent(a.update, tenantId)) {
        throw new TenantScopeError(
          `Refusing ${model}.upsert: update payload tenantId${tenantId ? ` must equal "${tenantId}"` : ""} does not match context.`
        );
      }
    } else if (!dataHasTenant(a.data, tenantId)) {
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

function delegateKey(modelName: string): string {
  return modelName.charAt(0).toLowerCase() + modelName.slice(1);
}

/**
 * Build a Prisma extension whose `query` block hooks lowercase model delegate
 * properties (e.g. `user`, `booking`) — Prisma resolves extensions by the
 * delegate name, not the PascalCase model name.
 */
export function tenantGuardExtension(config: TenantGuardConfig = {}) {
  const models = Array.from(new Set(config.models ?? TENANT_SCOPED_MODELS));
  const readTenant = config.getTenantId ?? getTenantId;

  const query: Record<string, Record<string, (params: any) => any>> = {};
  for (const modelName of models) {
    query[delegateKey(modelName)] = {
      async $allOperations({
        operation,
        args,
        query: run,
      }: {
        operation: string;
        args: unknown;
        query: (args: unknown) => Promise<unknown>;
      }) {
        assertTenantScope({ model: modelName, operation, args, tenantId: readTenant() });
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
