<!-- base-branch: eval/codex -->
<!-- eval-round: 14 -->
<!-- eval-spec: merchant-shell -->
<!-- eval-agent: codex -->

## Why

The dashboard pages are placeholders, so a signed-in merchant sees nothing. Services and today's bookings are the two screens that make the product demonstrable.

## Scope

Make the services page list and create real records, and make the today page list real bookings for the signed-in tenant.

**Allowed paths:**

- `__tests__/app/(app)/services/**`
- `app/(app)/services/**`
- `app/(app)/today/**`
- `__tests__/**` and `tests/**` for the tests that prove the criteria
- `docs/**` for documentation the change makes stale
- `.agents/**`, `package.json`, `package-lock.json` and `pnpm-lock.yaml` as toolchain output

## Non-Goals

No new models and no schema change. Editing and deleting services are out of scope; listing and creating are enough. Do not touch the public booking flow.

## Tasks

- [ ] Add `app/(app)/services/services-list.tsx`: render the tenant's services from the database
- [ ] Add `app/(app)/services/service-form.tsx`: build the create form posting to the services endpoint
- [ ] Add `app/(app)/services/page.tsx`: render the list above the form
- [ ] Add `app/(app)/today/page.tsx`: list today's bookings for the signed-in tenant
- [ ] Add `__tests__/app/(app)/services/services-list.test.tsx`: cover a tenant with two services
- [ ] Add `__tests__/app/(app)/services/services-list.test.tsx`: cover a tenant with none

## Acceptance Criteria

- [ ] The services page lists every service belonging to the signed-in tenant, verified by `pnpm test`
- [ ] Submitting the create form adds a service and it appears in the list, verified by `pnpm test`
- [ ] A service belonging to another tenant never appears, verified by `pnpm test`
- [ ] `pnpm test` passes

## Implementation Notes

Seeded for the codex evaluation lane. Work on the branch cut for this issue and open the pull request against the codex lane branch. Keep changes within the allowed paths listed under Scope; the acceptance verifier reports anything outside them as out of scope. Application code lives under the app directory and tests under the repository test directory; follow the existing layout rather than starting a parallel tree.

<details>
<summary>Original Issue</summary>

```text
Seeded from the round 14 specification, spec merchant-shell, agent codex.
```

</details>
