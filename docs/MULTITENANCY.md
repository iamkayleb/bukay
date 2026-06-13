# Multitenancy

Bukay isolates tenant-owned data with a `tenantId` column on every domain model
except the root `Tenant` model. Request handling and Prisma queries must preserve
that isolation explicitly.

## Request Pattern

Resolve the tenant selector at the request boundary with `resolveTenant(req)`.
An authenticated session tenant takes precedence over a hostname subdomain.
Subdomains resolve to tenant slugs and must be looked up before being used as a
tenant ID.

After resolving the tenant ID, run request work inside its async context:

```ts
import { runWithTenantContext } from "@/app/tenancy/tenant-context";

return runWithTenantContext({ tenantId }, async () => {
  return handleTenantRequest();
});
```

Code deeper in the request can use `requireTenantContext()` when it needs the
active tenant ID:

```ts
const { tenantId } = requireTenantContext();

const bookings = await prisma.booking.findMany({
  where: { tenantId, status: "CONFIRMED" },
});
```

## Prisma Query Rules

The application Prisma client in `app/db/prisma.ts` includes the tenant guard.
For tenant-scoped models, operations with a `where` argument must include a
non-empty, top-level `tenantId`. When a tenant context is active, that value must
also match the active context.

```ts
// Correct
await prisma.service.findMany({ where: { tenantId } });

// Rejected: tenantId is missing
await prisma.service.findMany({ where: { active: true } });

// Rejected: a nested condition can include rows from another tenant
await prisma.service.findMany({
  where: { OR: [{ tenantId }, { active: true }] },
});
```

Create operations do not have a `where` argument, so callers must set
`tenantId` in `data`. The guard does not replace this write responsibility.

The root `Tenant` model is not tenant-scoped. Queries used to resolve a
subdomain slug may query `Tenant` without a `tenantId`.

## Reviews

For every tenant-owned query:

- Import the guarded client from `app/db/prisma.ts`; do not construct a new
  application `PrismaClient`.
- Include the active `tenantId` at the top level of every `where`.
- Include `tenantId` in every create payload.
- Treat a tenant ID supplied by a client as untrusted; use the resolved request
  tenant instead.
- Do not add an unscoped `prisma.*.findMany()` call.
