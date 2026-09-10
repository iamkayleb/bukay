<!-- base-branch: eval/claude -->
<!-- eval-round: 11 -->
<!-- eval-spec: lifecycle-notifications -->
<!-- eval-agent: claude -->

## Why

Automatic confirmations and reminders are the feature merchants ask for first.

## Scope

Send WhatsApp with SMS fallback on create, confirm, cancel and reschedule, with retries and a dead-letter queue.

## Tasks

- [ ] Add `lib/notifications/subscribers.ts`: add subscribers
- [ ] Add `lib/notifications/dispatch.ts`: implement the dispatcher
- [ ] Add `lib/notifications/retry.ts`: implement backoff
- [ ] Add `prisma/schema.prisma`: add the `DeadLetter` model and a view in `app/(app)/admin/dlq/page.tsx`

## Acceptance Criteria

- [ ] All four lifecycle events dispatch a message, verified by `pnpm test`
- [ ] A WhatsApp failure falls back to SMS
- [ ] A permanently failed message appears in `DeadLetter`
- [ ] `pnpm test` passes
