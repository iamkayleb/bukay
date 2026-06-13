import { Prisma } from "@prisma/client";

const TENANT_SCOPED_MODELS = new Set([
  "AuditLog",
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

function hasTenantId(where: unknown): boolean {
  if (!where || typeof where !== "object" || Array.isArray(where)) {
    return false;
  }

  const tenantId = (where as Record<string, unknown>).tenantId;
  if (typeof tenantId === "string") {
    return tenantId.trim().length > 0;
  }

  if (tenantId && typeof tenantId === "object" && !Array.isArray(tenantId)) {
    const equals = (tenantId as Record<string, unknown>).equals;
    return typeof equals === "string" && equals.trim().length > 0;
  }

  return false;
}

function whereFromArgs(args: unknown): unknown {
  if (!args || typeof args !== "object" || Array.isArray(args)) {
    return undefined;
  }

  return (args as Record<string, unknown>).where;
}

export function assertTenantWhere(model: string, operation: string, args: unknown): void {
  if (
    TENANT_SCOPED_MODELS.has(model) &&
    OPERATIONS_WITH_WHERE.has(operation) &&
    !hasTenantId(whereFromArgs(args))
  ) {
    throw new Error(`${model}.${operation} requires a top-level tenantId in where`);
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
