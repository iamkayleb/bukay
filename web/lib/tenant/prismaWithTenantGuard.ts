import { getTenantIdOrNull } from "./tenantContext";

// Prisma models that belong to a tenant and must always be queried with tenantId.
// Model names match the Prisma schema (PascalCase) as surfaced in $allOperations.
export const TENANT_SCOPED_MODELS = new Set([
  "User",
  "Service",
  "Staff",
  "BusinessHour",
  "Client",
  "Booking",
  "Payment",
  "AuditLog",
]);

// Operations where tenantId must appear in the `where` clause.
// create/createMany are excluded — tenantId lives in `data` there.
const GUARDED_OPS = new Set([
  "findMany",
  "findFirst",
  "findFirstOrThrow",
  "findUnique",
  "findUniqueOrThrow",
  "update",
  "updateMany",
  "delete",
  "deleteMany",
  "count",
  "aggregate",
  "groupBy",
]);

export class TenantGuardError extends Error {
  constructor(model: string, operation: string, detail?: string) {
    super(
      `[TenantGuard] ${model}.${operation} blocked — ${detail ?? "tenantId missing from where clause"}`
    );
    this.name = "TenantGuardError";
  }
}

/**
 * Extracts the tenantId value(s) from a where clause, handling several Prisma
 * operator shapes and nested AND clauses:
 *   - Direct string:  { tenantId: "abc" }
 *   - equals op:      { tenantId: { equals: "abc" } }
 *   - in op:          { tenantId: { in: ["a", "b"] } }
 *   - AND nesting:    { AND: [{ tenantId: "abc" }, ...] }
 *
 * Returns the extracted value or null when no recognisable tenantId is found.
 */
export function extractTenantIdFromWhere(
  where: Record<string, unknown>
): string | string[] | null {
  // Direct string: { tenantId: "abc" }
  if (typeof where.tenantId === "string") return where.tenantId;

  // Prisma operator objects: { tenantId: { equals: "abc" } } or { tenantId: { in: [...] } }
  if (where.tenantId !== null && where.tenantId !== undefined && typeof where.tenantId === "object") {
    const op = where.tenantId as Record<string, unknown>;
    if (typeof op.equals === "string") return op.equals;
    if (Array.isArray(op.in) && op.in.length > 0 && op.in.every((v) => typeof v === "string")) {
      return op.in as string[];
    }
  }

  // AND clause: { AND: [{ tenantId: "abc" }, ...] }
  if (Array.isArray(where.AND)) {
    for (const clause of where.AND as Record<string, unknown>[]) {
      if (clause && typeof clause === "object") {
        const found = extractTenantIdFromWhere(clause as Record<string, unknown>);
        if (found !== null) return found;
      }
    }
  }

  return null;
}

/**
 * Pure guard function — throws TenantGuardError when a tenant-scoped model
 * is queried without tenantId in the where clause, or when the provided
 * tenantId does not match the active AsyncLocalStorage tenant context.
 */
export function assertTenantScoped(
  model: string,
  operation: string,
  args: { where?: Record<string, unknown> | null }
): void {
  if (!TENANT_SCOPED_MODELS.has(model) || !GUARDED_OPS.has(operation)) return;

  const where = args.where;
  if (!where) {
    throw new TenantGuardError(model, operation);
  }

  const extracted = extractTenantIdFromWhere(where);
  if (extracted === null) {
    throw new TenantGuardError(model, operation);
  }

  // When a tenant context is active, verify the where clause targets only that tenant.
  const contextTenantId = getTenantIdOrNull();
  if (contextTenantId !== null) {
    const allowed = Array.isArray(extracted)
      ? extracted.includes(contextTenantId)
      : extracted === contextTenantId;
    if (!allowed) {
      throw new TenantGuardError(
        model,
        operation,
        `tenantId in where clause does not match active tenant context (expected "${contextTenantId}")`
      );
    }
  }
}

type PrismaClientLike = {
  $extends: (extension: unknown) => unknown;
};

/**
 * Wraps a Prisma client with the tenant-guard extension.
 * Every guarded operation on a tenant-scoped model will throw TenantGuardError
 * if tenantId is absent from the where clause or mismatches the active context.
 */
export function withTenantGuard<T extends PrismaClientLike>(base: T) {
  return base.$extends({
    query: {
      $allModels: {
        async $allOperations({
          model,
          operation,
          args,
          query,
        }: {
          model: string;
          operation: string;
          args: { where?: Record<string, unknown> | null };
          query: (args: unknown) => Promise<unknown>;
        }) {
          assertTenantScoped(model, operation, args);
          return query(args);
        },
      },
    },
  });
}
