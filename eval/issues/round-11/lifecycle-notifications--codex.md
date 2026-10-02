<!-- base-branch: eval/codex -->
<!-- eval-round: 11 -->
<!-- eval-spec: lifecycle-notifications -->
<!-- eval-agent: codex -->

## Why

Automatic confirmations and reminders are the feature merchants ask for first.

## Scope

Send WhatsApp with SMS fallback on create, confirm, cancel and reschedule, with retries and a dead-letter queue.

**Allowed paths:**

- `app/(app)/admin/dlq/**`
- `app/lib/notifications/**`
- `prisma/**`
- `__tests__/**` and `tests/**` for the tests that prove the criteria
- `prisma/schema.prisma` and `prisma/migrations/**` when the work needs schema support
- `docs/**` for documentation the change makes stale
- `.agents/**`, `package.json`, `package-lock.json` and `pnpm-lock.yaml` as toolchain output

## Non-Goals

Nothing beyond the scope above. Leave repository automation configuration untouched.

## Tasks

- [ ] Add `app/lib/notifications/subscribers.ts`: add subscribers
- [ ] Add `app/lib/notifications/dispatch.ts`: implement the dispatcher
- [ ] Add `app/lib/notifications/retry.ts`: implement backoff
- [ ] Add `prisma/schema.prisma`: define the `DeadLetter` model
- [ ] Add `app/(app)/admin/dlq/page.tsx`: render the dead-letter view

## Acceptance Criteria

- [ ] All four lifecycle events dispatch a message, verified by `pnpm test`
- [ ] A WhatsApp failure falls back to SMS
- [ ] A permanently failed message appears in `DeadLetter`
- [ ] `pnpm test` passes

## Implementation Notes

Seeded for the codex evaluation lane. Work on the branch cut for this issue and open the pull request against the codex lane branch. Keep changes within the allowed paths listed under Scope; the acceptance verifier reports anything outside them as out of scope. Application code lives under the app directory and tests under the repository test directory; follow the existing layout rather than starting a parallel tree.

<details>
<summary>Original Issue</summary>

```text
Seeded from the round 11 specification, spec lifecycle-notifications, agent codex.
```

</details>
