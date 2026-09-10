<!-- base-branch: eval/cursor -->
<!-- eval-round: 11 -->
<!-- eval-spec: lifecycle-notifications -->
<!-- eval-agent: cursor -->

## Why

Automatic confirmations and reminders are the feature merchants ask for first.

## Scope

Send WhatsApp with SMS fallback on create, confirm, cancel and reschedule, with retries and a dead-letter queue.

## Non-Goals

Nothing beyond the scope above. Do not modify files under `.github/`.

## Tasks

- [ ] Add `app/lib/notifications/subscribers.ts`: add subscribers
- [ ] Add `app/lib/notifications/dispatch.ts`: implement the dispatcher
- [ ] Add `app/lib/notifications/retry.ts`: implement backoff
- [ ] Add `prisma/schema.prisma`: add the `DeadLetter` model and a view in `app/(app)/admin/dlq/page.tsx`

## Acceptance Criteria

- [ ] All four lifecycle events dispatch a message, verified by `pnpm test`
- [ ] A WhatsApp failure falls back to SMS
- [ ] A permanently failed message appears in `DeadLetter`
- [ ] `pnpm test` passes

## Implementation Notes

Seeded for the `cursor` evaluation lane. Work on the branch cut for this issue and open the pull request against `eval/cursor`. Keep changes limited to the files named in Tasks. This repository puts application code under `app/` (for example `app/lib/`) and tests under `__tests__/`; follow the existing layout rather than creating a parallel tree.

<details>
<summary>Original Issue</summary>

```text
Seeded from eval/rounds/round-11.json, spec `lifecycle-notifications`, agent `cursor`.
```

</details>
