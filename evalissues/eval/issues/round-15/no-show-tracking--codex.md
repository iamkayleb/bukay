<!-- base-branch: eval/codex -->
<!-- eval-round: 15 -->
<!-- eval-spec: no-show-tracking -->
<!-- eval-agent: codex -->

## Why

No-show data is the input to risk scoring and deposit gating.

## Scope

Owner marks bookings as no-show from the dashboard or by replying to the WhatsApp notification.

## Tasks

- [ ] Add `lib/booking-status.ts`: add the `no_show` transition
- [ ] Add `lib/whatsapp/routing.ts`: handle the reply shortcut
- [ ] Add `prisma/schema.prisma`: add no-show counters to the `Client` model
- [ ] Add `lib/audit.ts`: write an `AuditLog` row from

## Acceptance Criteria

- [ ] Both surfaces set status `no_show`, verified by `pnpm test`
- [ ] The counters on `Client` increment once per marking
- [ ] Marking a future booking returns HTTP 400
- [ ] `pnpm test` passes
