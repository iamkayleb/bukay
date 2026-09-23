<!-- base-branch: eval/cursor -->
<!-- eval-round: 11 -->
<!-- eval-spec: reminders -->
<!-- eval-agent: cursor -->

## Why

Reminders are the single highest-leverage lever on no-show rate.

## Scope

T-24h and T-2h reminders per booking with a per-tenant toggle and duplicate-safe scheduling.

## Tasks

- [ ] Add `scripts/reminder-cron.ts`: add the job running every 5 minutes
- [ ] Add `lib/locks.ts`: take Postgres advisory locks
- [ ] Add `prisma/schema.prisma`: add `reminderSentAt` to the `Booking` model
- [ ] Add `app/(app)/settings/page.tsx`: add the tenant toggle

## Acceptance Criteria

- [ ] Two parallel workers send exactly one reminder, verified by `pnpm test`
- [ ] Reminder dispatch falls within 5 minutes of the target time
- [ ] Disabling the toggle stops subsequent reminders
- [ ] `pnpm test` passes
