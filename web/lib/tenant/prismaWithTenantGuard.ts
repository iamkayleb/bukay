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
  "upsert",
  "delete",
  "deleteMany",
  "count",
  "aggregate",
  "groupBy",
]);

export class TenantGuardError extends Error {
  constructor(model: string, operation: string, detail?: string) {
    super(
      `[TenantGuard] ${model}.${operation} blocked — ${
        detail ?? "tenantId missing from where clause"
      }`
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
  const direct = extractDirectTenantId(where);
  const andConstraint = extractFromAnd(where.AND);
  const merged = mergeTenantCandidates(direct, andConstraint);
  if (merged) {
    return merged.length === 1 ? merged[0] : merged;
  }

  const orConstraint = extractFromOr(where.OR);
  if (orConstraint) {
    return orConstraint.length === 1 ? orConstraint[0] : orConstraint;
  }

  return null;
}

function extractDirectTenantId(where: Record<string, unknown>): string[] | null {
  if (typeof where.tenantId === "string") return [where.tenantId];

  if (
    where.tenantId !== null &&
    where.tenantId !== undefined &&
    typeof where.tenantId === "object"
  ) {
    const op = where.tenantId as Record<string, unknown>;
    if (typeof op.equals === "string") return [op.equals];
    if (
      Array.isArray(op.in) &&
      op.in.length > 0 &&
      op.in.every((v) => typeof v === "string")
    ) {
      return op.in as string[];
    }
  }

  return null;
}

function extractFromAnd(andClause: unknown): string[] | null {
  if (!Array.isArray(andClause) || andClause.length === 0) return null;

  let acc: string[] | null = null;
  for (const clause of andClause as Record<string, unknown>[]) {
    if (!clause || typeof clause !== "object") continue;
    const extracted = extractTenantIdFromWhere(
      clause as Record<string, unknown>
    );
    const normalized = normalizeTenantCandidates(extracted);
    if (!normalized) continue;
    acc = acc ? intersectCandidates(acc, normalized) : normalized;
  }

  return acc && acc.length > 0 ? acc : null;
}

function extractFromOr(orClause: unknown): string[] | null {
  if (!Array.isArray(orClause) || orClause.length === 0) return null;

  const union: string[] = [];
  for (const clause of orClause as Record<string, unknown>[]) {
    if (!clause || typeof clause !== "object") return null;
    const extracted = extractTenantIdFromWhere(
      clause as Record<string, unknown>
    );
    const normalized = normalizeTenantCandidates(extracted);
    if (!normalized) return null;
    for (const value of normalized) {
      if (!union.includes(value)) union.push(value);
    }
  }

  return union.length > 0 ? union : null;
}

function normalizeTenantCandidates(
  value: string | string[] | null
): string[] | null {
  if (!value) return null;
  return Array.isArray(value) ? value : [value];
}

function intersectCandidates(left: string[], right: string[]): string[] {
  return left.filter((value) => right.includes(value));
}

function mergeTenantCandidates(
  left: string[] | null,
  right: string[] | null
): string[] | null {
  if (left && right) return intersectCandidates(left, right);
  return left ?? right;
}

/**
 * Pure guard function — throws TenantGuardError when a tenant-scoped model
 * is queried without tenantId in the where clause, or when the provided
 * tenantId does not match the active AsyncLocalStorage tenant context.
 */
export function assertTenantScoped(
  model: string,
  operation: string,
  args?: { where?: Record<string, unknown> | null } | null
): void {
  if (!TENANT_SCOPED_MODELS.has(model) || !GUARDED_OPS.has(operation)) return;

  const where = args?.where;
  if (!where || typeof where !== "object") {
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  $extends: (extension: any) => any;
};

/**
 * Wraps a Prisma client with the tenant-guard extension.
 * Every guarded operation on a tenant-scoped model will throw TenantGuardError
 * if tenantId is absent from the where clause or mismatches the active context.
 */
export function withTenantGuard<T extends PrismaClientLike>(base: T): T {
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
  }) as unknown as T;
}
