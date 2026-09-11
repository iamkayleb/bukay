<!-- base-branch: eval/claude -->
<!-- eval-round: 19 -->
<!-- eval-spec: admin-backoffice -->
<!-- eval-agent: claude -->

## Why

Operators need a supported way to investigate and reconcile without direct database access.

## Scope

Internal console for tenant search, audited impersonation, reconciliation and abuse reports.

## Non-Goals

Nothing beyond the scope above. Leave repository automation configuration untouched.

## Tasks

- [ ] Add `prisma/schema.prisma`: add the `internal_admin` role to the `User` model
- [ ] Add `app/admin/page.tsx`: build the tenant search view
- [ ] Add `app/admin/page.tsx`: build the tenant detail view
- [ ] Add `app/lib/impersonate.ts`: implement impersonation with a banner component
- [ ] Add `app/admin/reconcile/page.tsx`: build the reconciliation view
- [ ] Add `app/admin/abuse/page.tsx`: build the abuse queue

## Acceptance Criteria

- [ ] A non-admin request to `/admin` returns HTTP 403, verified by `pnpm test`
- [ ] Every admin action writes an `AuditLog` row
- [ ] An impersonated session renders the banner component
- [ ] `pnpm test` passes

## Implementation Notes

Seeded for the claude evaluation lane. Work on the branch cut for this issue and open the pull request against the claude lane branch. Keep changes limited to the files named in Tasks. Application code lives under the app directory and tests under the repository test directory; follow the existing layout rather than starting a parallel tree.

<details>
<summary>Original Issue</summary>

```text
Seeded from the round 19 specification, spec admin-backoffice, agent claude.
```

</details>
