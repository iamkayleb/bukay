<!-- base-branch: eval/claude -->
<!-- eval-round: 11 -->
<!-- eval-spec: reminders -->
<!-- eval-agent: claude -->

## Why

Reminders are the single highest-leverage lever on no-show rate.

## Scope

T-24h and T-2h reminders per booking with a per-tenant toggle and duplicate-safe scheduling.

**Allowed paths:**

- `app/(app)/settings/**`
- `app/lib/**`
- `prisma/**`
- `scripts/**`
- `__tests__/**` and `tests/**` for the tests that prove the criteria
- `prisma/schema.prisma` and `prisma/migrations/**` when the work needs schema support
- `docs/**` for documentation the change makes stale
- `.agents/**`, `package.json`, `package-lock.json` and `pnpm-lock.yaml` as toolchain output

## Non-Goals

Nothing beyond the scope above. Leave repository automation configuration untouched.

## Tasks

- [ ] Add `scripts/reminder-cron.ts`: add the job running every 5 minutes
- [ ] Add `app/lib/locks.ts`: take Postgres advisory locks
- [ ] Add `prisma/schema.prisma`: add `reminderSentAt` to the `Booking` model
- [ ] Add `app/(app)/settings/page.tsx`: add the tenant toggle

## Acceptance Criteria

- [ ] Two parallel workers send exactly one reminder, verified by `pnpm test`
- [ ] Reminder dispatch falls within 5 minutes of the target time
- [ ] Disabling the toggle stops subsequent reminders
- [ ] `pnpm test` passes

## Implementation Notes

Seeded for the claude evaluation lane. Work on the branch cut for this issue and open the pull request against the claude lane branch. Keep changes within the allowed paths listed under Scope; the acceptance verifier reports anything outside them as out of scope. Application code lives under the app directory and tests under the repository test directory; follow the existing layout rather than starting a parallel tree.

<details>
<summary>Original Issue</summary>

```text
Seeded from the round 11 specification, spec reminders, agent claude.
```

</details>
