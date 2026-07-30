import { Prisma } from "@prisma/client";
import { tenantContext } from "@/app/tenancy/tenant-context";

const TENANT_SCOPED_MODELS = new Set([
  "AuditLog",
  "Blackout",
  "Booking",
  "BusinessHour",
  "Client",
  "Payment",
  "Service",
  "Staff",
  "User",
]);

const OPERATIONS_WITH_WHERE = new Set([
  "aggregate",
  "count",
  "delete",
  "deleteMany",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "findUnique",
  "findUniqueOrThrow",
  "groupBy",
  "update",
  "updateMany",
  "upsert",
]);

const OPERATIONS_WITH_DATA = new Set(["create", "createMany"]);

function normalizedTenantIdValue(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || undefined;
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const eq = (value as Record<string, unknown>).equals;
    if (typeof eq === "string") {
      const trimmed = eq.trim();
      return trimmed || undefined;
    }
  }
  return undefined;
}

/**
 * Walk `where` (including nested AND/OR) and return the tenantId when — and
 * only when — the clause provably restricts results to a single tenant.
 *
 * AND: any branch that supplies the tenantId narrows the whole conjunction.
 * OR: every branch must independently pin the same tenantId, otherwise a
 *     branch without a tenantId filter would leak cross-tenant data.
 */
export function tenantIdFromWhere(where: unknown): string | null {
  if (!where || typeof where !== "object" || Array.isArray(where)) return null;
  const w = where as Record<string, unknown>;

  const direct = normalizedTenantIdValue(w.tenantId);
  if (direct !== undefined) return direct;

  if (Array.isArray(w.AND)) {
    for (const branch of w.AND) {
      const found = tenantIdFromWhere(branch);
      if (found) return found;
    }
  }

  if (Array.isArray(w.OR) && w.OR.length > 0) {
    let candidate: string | null = null;
    for (const branch of w.OR) {
      const found = tenantIdFromWhere(branch);
      if (!found) return null;
      if (candidate === null) candidate = found;
      else if (candidate !== found) return null;
    }
    return candidate;
  }

  return null;
}

function whereFromArgs(args: unknown): unknown {
  if (!args || typeof args !== "object" || Array.isArray(args)) {
    return undefined;
  }

  return (args as Record<string, unknown>).where;
}

function tenantIdFromData(data: unknown): string | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const tid = (data as Record<string, unknown>).tenantId;
  if (typeof tid !== "string") return null;
  const trimmed = tid.trim();
  return trimmed || null;
}

export function assertTenantWhere(model: string, operation: string, args: unknown): void {
  if (!TENANT_SCOPED_MODELS.has(model)) return;

  const requestTenantId = tenantContext.getStore()?.tenantId;

  if (OPERATIONS_WITH_WHERE.has(operation)) {
    const tenantId = tenantIdFromWhere(whereFromArgs(args));
    if (!tenantId) {
      throw new Error(`${model}.${operation} requires a tenantId in where`);
    }
    if (requestTenantId && tenantId !== requestTenantId) {
      throw new Error(`${model}.${operation} tenantId does not match the active tenant context`);
    }
  }

  if (operation === "upsert") {
    const a = (args ?? {}) as Record<string, unknown>;
    const createTid = tenantIdFromData(a.create);
    if (!createTid) {
      throw new Error(`${model}.upsert create payload must include tenantId`);
    }
    if (requestTenantId && createTid !== requestTenantId) {
      throw new Error(`${model}.upsert create.tenantId does not match the active tenant context`);
    }
    const updateTid = tenantIdFromData(a.update);
    if (updateTid && requestTenantId && updateTid !== requestTenantId) {
      throw new Error(`${model}.upsert update.tenantId does not match the active tenant context`);
    }
  }

  if (OPERATIONS_WITH_DATA.has(operation)) {
    const a = (args ?? {}) as Record<string, unknown>;
    const data = a.data;
    if (Array.isArray(data)) {
      for (const row of data) {
        const tid = tenantIdFromData(row);
        if (!tid) {
          throw new Error(`${model}.${operation} data must include tenantId`);
        }
        if (requestTenantId && tid !== requestTenantId) {
          throw new Error(
            `${model}.${operation} tenantId does not match the active tenant context`
          );
        }
      }
    } else {
      const tid = tenantIdFromData(data);
      if (!tid) {
        throw new Error(`${model}.${operation} data must include tenantId`);
      }
      if (requestTenantId && tid !== requestTenantId) {
        throw new Error(`${model}.${operation} tenantId does not match the active tenant context`);
      }
    }
  }
}

export const tenantGuardExtension = Prisma.defineExtension({
  name: "tenant-guard",
  query: {
    $allModels: {
      $allOperations({ model, operation, args, query }) {
        assertTenantWhere(model, operation, args);
        return query(args);
      },
    },
  },
});
