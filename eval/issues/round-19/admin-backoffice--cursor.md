<!-- base-branch: eval/cursor -->
<!-- eval-round: 19 -->
<!-- eval-spec: admin-backoffice -->
<!-- eval-agent: cursor -->

## Why

Operators need a supported way to investigate and reconcile without direct database access.

## Scope

Internal console for tenant search, audited impersonation, reconciliation and abuse reports.

## Non-Goals

Nothing beyond the scope above. Do not modify files under `.github/`.

## Tasks

- [ ] Add `prisma/schema.prisma`: add the `internal_admin` role to the `User` model
- [ ] Add `app/admin/page.tsx`: build search and detail
- [ ] Add `app/lib/impersonate.ts`: implement impersonation with a banner component
- [ ] Add `app/admin/reconcile/page.tsx`: build the reconciliation view
- [ ] Add `app/admin/abuse/page.tsx`: build the abuse queue

## Acceptance Criteria

- [ ] A non-admin request to `/admin` returns HTTP 403, verified by `pnpm test`
- [ ] Every admin action writes an `AuditLog` row
- [ ] An impersonated session renders the banner component
- [ ] `pnpm test` passes

## Implementation Notes

Seeded for the `cursor` evaluation lane. Work on the branch cut for this issue and open the pull request against `eval/cursor`. Keep changes limited to the files named in Tasks. This repository puts application code under `app/` (for example `app/lib/`) and tests under `__tests__/`; follow the existing layout rather than creating a parallel tree.

<details>
<summary>Original Issue</summary>

```text
Seeded from eval/rounds/round-19.json, spec `admin-backoffice`, agent `cursor`.
```

</details>
