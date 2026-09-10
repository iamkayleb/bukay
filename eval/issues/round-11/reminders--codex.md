<!-- base-branch: eval/codex -->
<!-- eval-round: 11 -->
<!-- eval-spec: reminders -->
<!-- eval-agent: codex -->

## Why

Reminders are the single highest-leverage lever on no-show rate.

## Scope

T-24h and T-2h reminders per booking with a per-tenant toggle and duplicate-safe scheduling.

## Non-Goals

Nothing beyond the scope above. Do not modify files under `.github/`.

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

Seeded for the `codex` evaluation lane. Work on the branch cut for this issue and open the pull request against `eval/codex`. Keep changes limited to the files named in Tasks. This repository puts application code under `app/` (for example `app/lib/`) and tests under `__tests__/`; follow the existing layout rather than creating a parallel tree.

<details>
<summary>Original Issue</summary>

```text
Seeded from eval/rounds/round-11.json, spec `reminders`, agent `codex`.
```

</details>
