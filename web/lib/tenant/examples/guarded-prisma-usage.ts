/**
 * Examples of correct guarded Prisma client usage.
 *
 * Import `prisma` (not `basePrisma`) for all tenant-scoped queries.
 * The guard throws TenantGuardError when tenantId is absent from the
 * where clause or mismatches the active AsyncLocalStorage tenant context.
 *
 * basePrisma is reserved for Tenant-root operations (e.g. tenant lookup
 * during request resolution). Using it for tenant-scoped models bypasses
 * the guard entirely — do not do this.
 */

import { prisma } from "../../db";
import { tenantContext } from "../tenantContext";

// ---------------------------------------------------------------------------
// Pattern 1 — findMany with tenantId filter
// ---------------------------------------------------------------------------
export async function listBookingsForTenant(tenantId: string) {
  return prisma.booking.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
  });
}

// ---------------------------------------------------------------------------
// Pattern 2 — findFirst with compound where clause (AND nesting)
// ---------------------------------------------------------------------------
export async function findActiveClientByEmail(tenantId: string, email: string) {
  return prisma.client.findFirst({
    where: {
      AND: [{ tenantId }, { email }],
    },
  });
}

// ---------------------------------------------------------------------------
// Pattern 3 — update scoped to tenant
// ---------------------------------------------------------------------------
export async function updateStaffName(tenantId: string, staffId: string, name: string) {
  return prisma.staff.update({
    where: { tenantId, id: staffId },
    data: { name },
  });
}

// ---------------------------------------------------------------------------
// Pattern 4 — Running queries inside an explicit tenant context
//
// Use tenantContext.run() when you already resolved the tenant (e.g. in
// middleware) and want the guard to automatically verify all queries
// stay within that tenant's scope.
// ---------------------------------------------------------------------------
export async function runInTenantContext(
  tenantId: string,
  tenantSlug: string,
  work: () => Promise<void>
) {
  await tenantContext.run({ tenantId, tenantSlug }, work);
}

// Example: fetching payments inside a context run
export async function listPaymentsInContext(tenantId: string, tenantSlug: string) {
  return new Promise<Awaited<ReturnType<typeof prisma.payment.findMany>>>((resolve, reject) => {
    tenantContext.run({ tenantId, tenantSlug }, async () => {
      try {
        // The guard verifies where.tenantId === context.tenantId automatically.
        const payments = await prisma.payment.findMany({
          where: { tenantId },
        });
        resolve(payments);
      } catch (err) {
        reject(err);
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Pattern 5 — Using { tenantId: { in: [...] } } (e.g. super-admin read)
//
// NOTE: When a tenant context is active, the context tenantId must appear
// in the `in` list; otherwise the guard blocks the query.
// ---------------------------------------------------------------------------
export async function listUsersForTenants(tenantIds: string[]) {
  return prisma.user.findMany({
    where: { tenantId: { in: tenantIds } },
  });
}
