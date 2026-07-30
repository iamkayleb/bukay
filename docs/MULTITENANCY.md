# Multitenancy

Bukay isolates tenant-owned data with a `tenantId` column on every domain model
except the root `Tenant` model. Request handling and Prisma queries must preserve
that isolation explicitly.

## Trusted Tenant Sources

Tenant identity is resolved **only** from sources the application controls:

1. **Session** — the authenticated session cookie is signed and validated by the
   server, so its `tenantId` is trustworthy.
2. **Subdomain** — the hostname is derived by the routing layer from the request
   URL and cannot be forged by a client that does not already control DNS. A
   subdomain resolves to a slug that must be looked up before it is used as a
   tenantId.

### DO NOT accept `x-tenant-id` from clients

Client-supplied headers such as `x-tenant-id`, `x-tenant`, or any other request
header a browser or attacker can set are **not** a trust boundary. Any code that
reads a header-supplied `tenantId` opens a cross-tenant IDOR: a request to
`GET /api/services` with `x-tenant-id: victim` would let an authenticated user
of one tenant read a different tenant's rows.

The application middleware in [`middleware.ts`](../middleware.ts) rejects
requests that arrive with `x-tenant-id` (or `x-tenant`) headers with a `400
untrusted_tenant_header` response, and the request-boundary helper
[`withTenantScope`](../src/middleware/tenantContext.ts) never reads a tenant
from headers.

An `x-tenant-id` header is only ever acceptable when it originates from an
already-authenticated trusted-boundary component — for example, an internal
gateway that terminates auth and re-issues signed requests. That boundary does
not exist today, so no route should rely on it.

## Request Pattern

Route handlers should route every request through `withTenantScope`:

```ts
import { NextRequest } from "next/server";
import { withTenantScope } from "@/src/middleware/tenantContext";
import { prisma } from "@/app/db/prisma";

export function GET(req: NextRequest) {
  return withTenantScope(req, async (tenantId) => {
    const bookings = await prisma.booking.findMany({
      where: { tenantId, status: "CONFIRMED" },
    });
    return Response.json({ bookings });
  });
}
```

`withTenantScope`:

1. resolves the tenant from session or subdomain (never from headers);
2. runs the handler inside `runWithTenantContext`, so the Prisma tenant guard
   can enforce isolation on every query;
3. returns a `400 tenant_required` response when no tenant can be resolved.

Code deeper in the request can call `requireTenantContext()` when it needs the
active tenant ID.

## Prisma Query Rules

The application Prisma client in `app/db/prisma.ts` includes the tenant guard
extension. The extension hooks Prisma's model delegate properties via
`$allModels` — for tenant-scoped models, operations with a `where` argument
must include a matching `tenantId`. When a tenant context is active, that value
must equal the active context.

```ts
// Correct — tenantId at the top level.
await prisma.service.findMany({ where: { tenantId } });

// Correct — tenantId nested inside AND. The guard recognizes AND branches
// that pin the tenant.
await prisma.service.findMany({
  where: { AND: [{ tenantId }, { active: true }] },
});

// Rejected — tenantId is missing.
await prisma.service.findMany({ where: { active: true } });

// Rejected — a nested OR branch without a tenantId would leak cross-tenant
// rows. Every OR branch must pin the same tenantId.
await prisma.service.findMany({
  where: { OR: [{ tenantId }, { active: true }] },
});
```

Create operations must set `tenantId` in `data`. `upsert` operations must set
`tenantId` in the `create` payload, and any `tenantId` in the `update` payload
must match the active context. The guard rejects mismatches on both sides.

The root `Tenant` model is not tenant-scoped. Queries used to resolve a
subdomain slug may query `Tenant` without a `tenantId`.

## Warning: Raw SQL Bypasses the Guard

Prisma's raw-query entry points do **not** go through the model delegate
proxy, so the tenant guard extension cannot intercept them:

- `prisma.$queryRaw` / `prisma.$queryRawUnsafe`
- `prisma.$executeRaw` / `prisma.$executeRawUnsafe`

Any raw query is on its own. If you must use raw SQL:

1. Prefer a Prisma-modelled query first; raw SQL is a last resort.
2. Always parameterize the tenant filter (`WHERE "tenantId" = $1`) and pass the
   active tenant ID from `requireTenantContext()`.
3. Never accept a `tenantId` from a client-supplied value.
4. Add a code comment linking to this section so reviewers can double-check the
   bypass.

Integration tests in
`__tests__/app/db/prisma-extension.integration.test.ts` document this bypass
by exercising `$queryRaw` and `$executeRaw` against the extended client and
showing that cross-tenant rows are returned — so the failure mode is captured
in CI, not left to reviewers to remember.

## Reviews

For every tenant-owned query:

- Import the guarded client from `app/db/prisma.ts`; do not construct a new
  application `PrismaClient`.
- Include the active `tenantId` at the top level of every `where`, or nest it
  under `AND` when composing conditions. Never use bare `OR` branches without
  a `tenantId` in every branch.
- Include `tenantId` in every create payload; include it (or omit it) in every
  upsert `update` payload.
- Treat a tenant ID supplied by a client as untrusted; use the resolved request
  tenant from `withTenantScope` / `requireTenantContext()` instead.
- Do not add an unscoped `prisma.*.findMany()` call.
- Do not add `$queryRaw`/`$executeRaw` without an explicit tenant filter and a
  reviewer note.
