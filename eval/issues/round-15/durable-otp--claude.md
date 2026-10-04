<!-- base-branch: eval/claude -->
<!-- eval-round: 15 -->
<!-- eval-spec: durable-otp -->
<!-- eval-agent: claude -->

## Why

Codes live in a module-level Map. Separate route handlers can hold separate instances of that module, so a code issued by the login route is not found by the verify route, and nothing survives a restart or a second server instance.

## Scope

Move the one-time code store to the database, keeping the existing hashing, expiry, attempt limit and rate limit behaviour.

**Allowed paths:**

- `__tests__/app/lib/auth/**`
- `app/lib/auth/**`
- `prisma/**`
- `__tests__/**` and `tests/**` for the tests that prove the criteria
- `prisma/schema.prisma` and `prisma/migrations/**` for the schema support this work needs
- `docs/**` for documentation the change makes stale
- `.agents/**`, `package.json`, `package-lock.json` and `pnpm-lock.yaml` as toolchain output

## Non-Goals

Do not change the code format, the expiry window, the attempt limit or the rate-limit thresholds. No Redis, no new dependency.

## Tasks

- [ ] Add `prisma/schema.prisma`: add an `OtpCode` model keyed by phone
- [ ] Add `prisma/migrations/`: generate the migration for the new model
- [ ] Add `app/lib/auth/otp.ts`: write an issued code to the database
- [ ] Add `app/lib/auth/otp.ts`: read the stored row when verifying
- [ ] Add `app/lib/auth/otp.ts`: delete the row once a code is consumed
- [ ] Add `app/lib/auth/otp.ts`: keep the existing expiry behaviour against the stored row
- [ ] Add `app/lib/auth/otp.ts`: keep the existing attempt limit against the stored row
- [ ] Add `__tests__/app/lib/auth/otp.test.ts`: cover verification in a separate call from issuance

## Acceptance Criteria

- [ ] A code issued through the login route verifies through the verify route in a separate request, verified by `pnpm test`
- [ ] An expired stored code is rejected, verified by `pnpm test`
- [ ] Exceeding the attempt limit rejects further tries, verified by `pnpm test`
- [ ] `pnpm test` passes

## Implementation Notes

Seeded for the claude evaluation lane. Work on the branch cut for this issue and open the pull request against the claude lane branch. Keep changes within the allowed paths listed under Scope; the acceptance verifier reports anything outside them as out of scope. Application code lives under the app directory and tests under the repository test directory; follow the existing layout rather than starting a parallel tree.

<details>
<summary>Original Issue</summary>

```text
Seeded from the round 15 specification, spec durable-otp, agent claude.
```

</details>
