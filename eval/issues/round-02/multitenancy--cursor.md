<!-- base-branch: eval/cursor -->
<!-- eval-round: 2 -->
<!-- eval-spec: multitenancy -->
<!-- eval-agent: cursor -->

## Why

Tenant isolation must be enforced structurally before tenant data exists, or every later query is a leak risk.

## Scope

Add request-scoped tenant resolution and a Prisma extension that rejects queries on tenant-scoped models when `tenantId` is absent.

## Non-Goals

Nothing beyond the scope above. Do not modify files under `.github/`.

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

## Implementation Notes

Seeded for the `cursor` evaluation lane. Work on the branch cut for this issue and open the pull request against `eval/cursor`. Keep changes limited to the files named in Tasks.

<details>
<summary>Original Issue</summary>

```text
Seeded from eval/rounds/round-02.json, spec `multitenancy`, agent `cursor`.
```

</details>
