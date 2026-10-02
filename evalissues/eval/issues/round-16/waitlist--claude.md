<!-- base-branch: eval/claude -->
<!-- eval-round: 16 -->
<!-- eval-spec: waitlist -->
<!-- eval-agent: claude -->

## Why

Refilling cancelled slots automatically recovers revenue the merchant would otherwise lose.

## Scope

On cancellation, notify waitlisted clients in order; the first to pay keeps the slot.

## Tasks

- [ ] Add `prisma/schema.prisma`: add the `Waitlist` model
- [ ] Add `app/[slug]/book/page.tsx`: add enrollment and `lib/agent/tools/`
- [ ] Add `lib/waitlist.ts`: implement the dispatcher
- [ ] Add `prisma/migrations/`: add a unique claim constraint

## Acceptance Criteria

- [ ] Concurrent claims result in exactly one winner, verified by `pnpm test`
- [ ] Notifications dispatch in enrollment order
- [ ] An unclaimed slot returns to open availability after 30 minutes
- [ ] `pnpm test` passes
