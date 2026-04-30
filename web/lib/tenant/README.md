# Tenant Infrastructure

Request-scoped multi-tenancy for the application, built on AsyncLocalStorage and a Prisma client extension.

## Modules

| File | Purpose |
|------|---------|
| `tenantContext.ts` | AsyncLocalStorage store — holds the active `tenantId` / `tenantSlug` for the current request |
| `resolveTenant.ts` | Extracts the tenant slug from the incoming request (subdomain → session → cookie fallback) |
| `prismaWithTenantGuard.ts` | Prisma client extension that blocks queries missing a valid `tenantId` in `where` |

The guarded client is exported from `web/lib/db.ts` as `prisma` (default for application code) and `basePrisma` (unguarded, **restricted use only** — see below).

## Quick Start

```ts
// In application code, always import the guarded client:
import { prisma } from "@/lib/db";
import { tenantContext } from "@/lib/tenant/tenantContext";

// Wrap request handlers with the tenant context so the guard can validate queries:
tenantContext.run({ tenantId, tenantSlug }, async () => {
  const bookings = await prisma.booking.findMany({
    where: { tenantId },
  });
});
```

See [`examples/guarded-prisma-usage.ts`](./examples/guarded-prisma-usage.ts) for more patterns.

## Supported `where` Shapes

The guard recognises tenantId in all of the following positions:

```ts
// Direct string
prisma.user.findMany({ where: { tenantId: "abc" } });

// equals operator
prisma.user.findMany({ where: { tenantId: { equals: "abc" } } });

// in operator
prisma.user.findMany({ where: { tenantId: { in: ["abc", "def"] } } });

// AND nesting
prisma.user.findMany({ where: { AND: [{ tenantId: "abc" }, { isActive: true }] } });

// OR with tenantId in every branch
prisma.user.findMany({ where: { OR: [{ tenantId: "abc" }, { tenantId: "def" }] } });
```

When a tenant context is active (via `tenantContext.run()`), the guard additionally verifies that the tenantId in the `where` clause matches the context. A `TenantGuardError` is thrown if they differ.

## `basePrisma` — Restricted Use

> **Warning**: `basePrisma` bypasses the tenant guard entirely. Importing it for tenant-scoped model queries is a security risk — it allows cross-tenant data access with no enforcement.

`basePrisma` is only appropriate for:

- **Tenant lookup** during request resolution (e.g. `basePrisma.tenant.findUnique({ where: { slug } })`)
- Migrations and seed scripts running outside of a request context

For all other queries, use the guarded `prisma` export from `@/lib/db`.

## Tenant-Scoped Models

The following Prisma models require `tenantId` in every read/write `where` clause:

- `User`
- `Service`
- `Staff`
- `BusinessHour`
- `Client`
- `Booking`
- `Payment`
- `AuditLog`

The `Tenant` model itself is **not** tenant-scoped and can be queried via `basePrisma` without a `tenantId`.

## Error Reference

`TenantGuardError` is thrown when:
1. A tenant-scoped model is queried without `tenantId` in the `where` clause.
2. The `tenantId` in the `where` clause does not match the active tenant context.

```ts
import { TenantGuardError } from "@/lib/tenant/prismaWithTenantGuard";

try {
  await prisma.user.findMany({ where: {} }); // throws
} catch (err) {
  if (err instanceof TenantGuardError) {
    // Handle guard violation
  }
}
```
