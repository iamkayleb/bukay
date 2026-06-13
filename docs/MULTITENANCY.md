# Multi-tenancy

Bukay is a multi-tenant booking platform. Every tenant-owned row in the database
carries a `tenantId`. To prevent cross-tenant data leaks, the application
resolves the active tenant per request and a Prisma client extension refuses
any query against a tenant-scoped model that does not include `tenantId` in its
`where` clause (or `data` payload).

## Components

| Layer                  | File                        | Responsibility                                                                                                |
| ---------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Tenant resolution      | `app/lib/resolve-tenant.ts` | Resolve the active tenant from session → `x-tenant-id` header → subdomain.                                    |
| Request-scoped context | `app/lib/tenant-context.ts` | Stash the resolved tenant in `AsyncLocalStorage` so downstream code can read it without prop-drilling.        |
| Database guard         | `app/lib/tenant-guard.ts`   | Prisma extension + Proxy wrapper that asserts `tenantId` is present on every query for a tenant-scoped model. |
| Client wiring          | `app/db/prisma.ts`          | Builds the singleton `PrismaClient` with the guard extension applied.                                         |

## Request lifecycle

```
HTTP request
  │
  ▼
resolveTenant(req)        ── reads session / header / subdomain
  │
  ▼
runWithTenant(ctx, ...)   ── stores { tenantId, tenantSlug } in AsyncLocalStorage
  │
  ▼
handler / service code    ── calls prisma.<model>.<op>(...)
  │
  ▼
tenantGuardExtension      ── asserts where.tenantId / data.tenantId is present
  │                          and equals the current context's tenantId
  ▼
PrismaClient              ── executes the query
```

## Using the helpers

### 1. Resolve the tenant at the edge of the request

```ts
import { resolveTenant } from "@/app/lib/resolve-tenant";
import { runWithTenant } from "@/app/lib/tenant-context";

export async function handle(req: Request, session: { tenantId?: string } | null) {
  const resolved = resolveTenant({ headers: req.headers, session });

  if (!resolved.tenantId) {
    return new Response("Tenant could not be resolved", { status: 400 });
  }

  return runWithTenant({ tenantId: resolved.tenantId, tenantSlug: resolved.tenantSlug }, () =>
    routeHandler(req)
  );
}
```

Resolution order:

1. `session.tenantId` (already-authenticated request)
2. `x-tenant-id` request header (server-to-server / internal calls)
3. Subdomain extracted from the `Host` header (`acme.example.com` → `acme`)

Reserved subdomains (`www`, `app`, `api`, `admin`, `static`, `assets`, `cdn`)
never resolve to a tenant. Set `ROOT_HOST=example.com` in the environment to
allow multi-label tenant subdomains like `north.acme.example.com`.

### 2. Read the tenant inside handlers

```ts
import { requireTenantId } from "@/app/lib/tenant-context";

const tenantId = requireTenantId();
const bookings = await prisma.booking.findMany({ where: { tenantId } });
```

`getTenantId()` returns `undefined` when no tenant scope is active.
`requireTenantId()` throws — use it when missing context is a programmer error.

### 3. Write tenant-safe queries

Every query against a tenant-scoped model **must** include `tenantId` in its
`where` (reads / updates / deletes) or `data` (creates):

```ts
// Good
prisma.booking.findMany({ where: { tenantId, status: "PENDING" } });
prisma.booking.create({ data: { tenantId /* ... */ } });

// Throws TenantScopeError
prisma.booking.findMany({ where: { status: "PENDING" } });
prisma.booking.findUnique({ where: { id } });
prisma.booking.create({
  data: {
    /* tenantId missing */
  },
});
```

If the current `AsyncLocalStorage` context carries a `tenantId`, the guard also
rejects queries whose `where.tenantId` does not match the context — preventing
a handler that resolved tenant A from accidentally reading tenant B's rows.

## Tenant-scoped models

The guard treats these models as tenant-scoped (see
`TENANT_SCOPED_MODELS` in `app/lib/tenant-guard.ts`):

- `User`
- `Service`
- `Staff`
- `BusinessHour`
- `Client`
- `Booking`
- `Payment`
- `AuditLog`

`Tenant` itself is intentionally **not** scoped (the row is identified by `id`,
not by membership in another tenant).

When adding a new model that belongs to a tenant:

1. Add `tenantId` and the `Tenant` relation to its Prisma model.
2. Add the model name to `TENANT_SCOPED_MODELS`.
3. Update existing call sites to pass `tenantId` in queries.

## Testing

The guard is unit-tested in `__tests__/app/lib/tenant-guard.test.ts`:

- A cross-tenant read throws `TenantScopeError`.
- A read with the correct `tenantId` returns the expected row.
- A `create` without `tenantId` throws.
- The Proxy wrapper reads the current tenant from `AsyncLocalStorage` when no
  override is provided.

Use `withTenantGuard(stubClient, { getTenantId: () => "..." })` in tests that
need to exercise the guard against an in-memory client without spinning up a
real database.

## Operational notes

- Always wrap request handlers in `runWithTenant`. A query issued outside a
  scope only passes the guard if it explicitly includes `tenantId` in `where`
  / `data`; do not rely on that fallback in production code paths.
- Background jobs and scheduled tasks must call `runWithTenant` themselves
  before issuing tenant-scoped queries.
- Raw SQL (`prisma.$queryRaw`, `prisma.$executeRaw`) bypasses the guard. Avoid
  it for tenant-scoped tables, or include an explicit `WHERE tenant_id = ?`
  predicate and reviewer sign-off.
