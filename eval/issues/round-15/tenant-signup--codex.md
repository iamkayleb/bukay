<!-- base-branch: eval/codex -->
<!-- eval-round: 15 -->
<!-- eval-spec: tenant-signup -->
<!-- eval-agent: codex -->

## Why

Verifying a code mints a session for a synthetic id built from the phone string, and no database row is ever written. There is no signup, so a signed-in merchant has no tenant and every dashboard screen has nothing to scope to.

## Scope

On a first successful verification, create the tenant and its owner, link the session to those real rows, and reuse them on later sign-ins. Add the phone column the lookup needs.

**Allowed paths:**

- `__tests__/app/lib/auth/**`
- `app/api/auth/verify/**`
- `app/lib/auth/**`
- `prisma/**`
- `__tests__/**` and `tests/**` for the tests that prove the criteria
- `prisma/schema.prisma` and `prisma/migrations/**` for the schema support this work needs
- `docs/**` for documentation the change makes stale
- `.agents/**`, `package.json`, `package-lock.json` and `pnpm-lock.yaml` as toolchain output

## Non-Goals

No invite flow, no multi-user tenants, no role management. Do not change the OTP exchange itself or the session cookie format.

## Tasks

- [ ] Add `prisma/schema.prisma`: add a unique `phone` column to the `User` model
- [ ] Add `prisma/migrations/`: generate the migration for the new column
- [ ] Add `app/lib/auth/account.ts`: look up an existing user by phone
- [ ] Add `app/lib/auth/account.ts`: create a tenant with a generated unique slug when no user matches
- [ ] Add `app/lib/auth/account.ts`: create the owner user linked to that tenant
- [ ] Add `app/api/auth/verify/route.ts`: put the real user id in the session payload
- [ ] Add `app/api/auth/verify/route.ts`: put the tenant id in the session payload
- [ ] Add `__tests__/app/lib/auth/account.test.ts`: cover a first sign-in creating both rows
- [ ] Add `__tests__/app/lib/auth/account.test.ts`: cover a repeat sign-in reusing them

## Acceptance Criteria

- [ ] A first verification writes one tenant row and one user row, verified by `pnpm test`
- [ ] A second verification for the same phone writes no new rows, verified by `pnpm test`
- [ ] The session payload carries the persisted user id rather than a string built from the phone, verified by `pnpm test`
- [ ] `pnpm test` passes

## Implementation Notes

Seeded for the codex evaluation lane. Work on the branch cut for this issue and open the pull request against the codex lane branch. Keep changes within the allowed paths listed under Scope; the acceptance verifier reports anything outside them as out of scope. Application code lives under the app directory and tests under the repository test directory; follow the existing layout rather than starting a parallel tree.

<details>
<summary>Original Issue</summary>

```text
Seeded from the round 15 specification, spec tenant-signup, agent codex.
```

</details>
