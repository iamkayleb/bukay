<!-- base-branch: eval/codex -->
<!-- eval-round: 2 -->
<!-- eval-spec: multitenancy -->
<!-- eval-agent: codex -->

## Why

Tenant isolation must be enforced structurally before tenant data exists, or every later query is a leak risk.

## Scope

Add request-scoped tenant resolution and a Prisma extension that rejects queries on tenant-scoped models when `tenantId` is absent.

## Tasks

- [ ] Add `lib/tenant.ts`: implement `resolveTenant()` reading subdomain and session
- [ ] Add `lib/prisma.ts`: add the tenant-guard extension
- [ ] Add `lib/tenant-context.ts`: expose `tenantContext` via AsyncLocalStorage
- [ ] Add `tests/tenant-isolation.test.ts` covering cross-tenant reads
- [ ] Add `docs/MULTITENANCY.md`: document the pattern

## Acceptance Criteria

- [ ] A cross-tenant query throws, verified by `pnpm test`
- [ ] A correctly scoped query returns the expected row
- [ ] No call site uses `prisma.*.findMany()` without a `tenantId` filter
- [ ] `pnpm test` passes
