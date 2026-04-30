# Multi-Tenancy Pattern

This document describes how tenant isolation is implemented in the Bukay web application.

## Overview

All business data belongs to a `Tenant`. Every tenant-scoped model (User, Service, Staff, BusinessHour, Client, Booking, Payment, AuditLog) carries a `tenantId` foreign key. The application enforces isolation at three layers:

1. **Request-scoped resolution** — `resolveTenant` maps an incoming request to a Tenant record.
2. **Context propagation** — `tenantContext` (AsyncLocalStorage) carries the resolved tenant through the call stack without prop-drilling.
3. **Query guard** — the Prisma client extension `withTenantGuard` throws `TenantGuardError` at the query layer if a tenant-scoped model is queried without `tenantId` in the `where` clause.

## Files

| File | Purpose |
|------|---------|
| `web/lib/tenant/resolveTenant.ts` | Extract tenant slug from subdomain or cookie; look up Tenant record |
| `web/lib/tenant/tenantContext.ts` | AsyncLocalStorage store; `getTenantId()` helper |
| `web/lib/tenant/prismaWithTenantGuard.ts` | Prisma `$extends` guard + `assertTenantScoped` |
| `web/lib/db.ts` | Singleton base `PrismaClient` + default guarded export |

## Tenant Resolution

`resolveTenant(req, lookup)` resolves in this order:

1. **Subdomain** — `acme.example.com` → slug `"acme"`.
2. **Session** — `tenantSlug` stored in the authenticated session for non-subdomain flows.
3. **Cookie (fallback)** — `tenantSlug` cookie set after login when session data is unavailable.

The `lookup` argument is a `(slug: string) => Promise<ResolvedTenant | null>` callback so the function is testable without a real database. In production, pass a wrapper around `basePrisma.tenant.findUnique`.

```ts
import { basePrisma } from "@/lib/db";
import { resolveTenant } from "@/lib/tenant/resolveTenant";

const tenant = await resolveTenant(
  req,
  (slug) => basePrisma.tenant.findUnique({ where: { slug } }),
  { tenantSlug: session?.tenantSlug }
);
```

## Tenant Context (AsyncLocalStorage)

Middleware resolves the tenant and runs the rest of the request inside `tenantContext.run(...)`:

```ts
import { tenantContext } from "@/lib/tenant/tenantContext";

// In Next.js middleware or a route wrapper:
tenantContext.run({ tenantId: tenant.id, tenantSlug: tenant.slug }, () => {
  return next();
});
```

Inside any downstream handler, retrieve the current tenant ID:

```ts
import { getTenantId } from "@/lib/tenant/tenantContext";

const tenantId = getTenantId(); // throws if called outside a run() context
```

## Tenant Guard (Prisma Extension)

The default `prisma` export from `web/lib/db.ts` is wrapped with `withTenantGuard`. Any guarded operation on a tenant-scoped model that lacks `where.tenantId` throws `TenantGuardError` immediately — before the query reaches the database.

```ts
import { prisma } from "@/lib/db";

// OK — tenantId present
await prisma.user.findMany({ where: { tenantId, email: "foo@example.com" } });
```

Guarded operations: `findMany`, `findFirst`, `findFirstOrThrow`, `findUnique`, `findUniqueOrThrow`, `update`, `updateMany`, `delete`, `deleteMany`, `count`, `aggregate`, `groupBy`.

`create` and `createMany` are **not** guarded via `where` — `tenantId` must be supplied in `data`, which the Prisma schema enforces at the type level.

### Querying the Tenant table itself

The `Tenant` model is not tenant-scoped (it is the root entity). Use `basePrisma` for tenant lookups:

```ts
import { basePrisma } from "@/lib/db";

const tenant = await basePrisma.tenant.findUnique({ where: { slug } });
```

## Error Handling

`TenantGuardError` extends `Error` with `name = "TenantGuardError"`. Catch it at the API boundary and return `400` or `403` as appropriate.

```ts
import { TenantGuardError } from "@/lib/tenant/prismaWithTenantGuard";

try {
  const rows = await prisma.booking.findMany({ where: { tenantId } });
} catch (err) {
  if (err instanceof TenantGuardError) {
    return NextResponse.json({ error: "Tenant scope required" }, { status: 400 });
  }
  throw err;
}
```

## Testing

Unit tests live in `web/lib/tenant/__tests__/tenantGuard.test.ts`. Run with:

```sh
cd web && npm test
```

The tests cover:
- `assertTenantScoped` throws for all tenant-scoped models when `tenantId` is absent.
- `assertTenantScoped` passes when `tenantId` is present.
- `withTenantGuard` extension throws on cross-tenant reads and passes on scoped reads.
- `extractSubdomainSlug` correctly parses host headers.
- `resolveTenant` resolves via subdomain and falls back to cookie.
- `tenantContext` provides correct store inside `run()` and throws outside.
