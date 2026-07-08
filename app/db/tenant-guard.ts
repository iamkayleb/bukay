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

function tenantIdFromWhere(where: unknown): string | null {
  if (!where || typeof where !== "object" || Array.isArray(where)) {
    return null;
  }

  const tenantId = (where as Record<string, unknown>).tenantId;
  if (typeof tenantId === "string") {
    return tenantId.trim() || null;
  }

  if (tenantId && typeof tenantId === "object" && !Array.isArray(tenantId)) {
    const equals = (tenantId as Record<string, unknown>).equals;
    return typeof equals === "string" ? equals.trim() || null : null;
  }

  return null;
}

function whereFromArgs(args: unknown): unknown {
  if (!args || typeof args !== "object" || Array.isArray(args)) {
    return undefined;
  }

  return (args as Record<string, unknown>).where;
}

export function assertTenantWhere(model: string, operation: string, args: unknown): void {
  if (!TENANT_SCOPED_MODELS.has(model) || !OPERATIONS_WITH_WHERE.has(operation)) {
    return;
  }

  const tenantId = tenantIdFromWhere(whereFromArgs(args));
  if (!tenantId) {
    throw new Error(`${model}.${operation} requires a top-level tenantId in where`);
  }

  const requestTenantId = tenantContext.getStore()?.tenantId;
  if (requestTenantId && tenantId !== requestTenantId) {
    throw new Error(`${model}.${operation} tenantId does not match the active tenant context`);
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
