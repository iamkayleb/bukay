<!-- base-branch: eval/claude -->
<!-- eval-round: 19 -->
<!-- eval-spec: admin-backoffice -->
<!-- eval-agent: claude -->

## Why

Operators need a supported way to investigate and reconcile without direct database access.

## Scope

Internal console for tenant search, audited impersonation, reconciliation and abuse reports.

## Tasks

- [ ] Add `prisma/schema.prisma`: add the `internal_admin` role to the `User` model
- [ ] Add `app/admin/page.tsx`: build search and detail
- [ ] Add `lib/impersonate.ts`: implement impersonation with a banner component
- [ ] Add `app/admin/reconcile/page.tsx`: build the reconciliation view
- [ ] Add `app/admin/abuse/page.tsx`: build the abuse queue

## Acceptance Criteria

- [ ] A non-admin request to `/admin` returns HTTP 403, verified by `pnpm test`
- [ ] Every admin action writes an `AuditLog` row
- [ ] An impersonated session renders the banner component
- [ ] `pnpm test` passes
