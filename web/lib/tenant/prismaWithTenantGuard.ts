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
  constructor(model: string, operation: string) {
    super(
      `[TenantGuard] ${model}.${operation} blocked — tenantId missing from where clause`
    );
    this.name = "TenantGuardError";
  }
}

/**
 * Pure guard function — throws TenantGuardError when a tenant-scoped model
 * is queried without tenantId in the where clause.
 */
export function assertTenantScoped(
  model: string,
  operation: string,
  args: { where?: Record<string, unknown> | null }
): void {
  if (!TENANT_SCOPED_MODELS.has(model) || !GUARDED_OPS.has(operation)) return;
  if (!args.where?.tenantId) {
    throw new TenantGuardError(model, operation);
  }
}

type PrismaClientLike = {
  $extends: (extension: unknown) => unknown;
};

/**
 * Wraps a Prisma client with the tenant-guard extension.
 * Every guarded operation on a tenant-scoped model will throw TenantGuardError
 * if tenantId is absent from the where clause.
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
