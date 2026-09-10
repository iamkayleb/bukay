<!-- base-branch: eval/cursor -->
<!-- eval-round: 16 -->
<!-- eval-spec: waitlist -->
<!-- eval-agent: cursor -->

## Why

Refilling cancelled slots automatically recovers revenue the merchant would otherwise lose.

## Scope

On cancellation, notify waitlisted clients in order; the first to pay keeps the slot.

## Non-Goals

Nothing beyond the scope above. Do not modify files under `.github/`.

## Tasks

- [ ] Add `prisma/schema.prisma`: add the `Waitlist` model
- [ ] Add `app/[slug]/book/page.tsx`: add enrollment and `app/lib/agent/tools/`
- [ ] Add `app/lib/waitlist.ts`: implement the dispatcher
- [ ] Add `prisma/migrations/`: add a unique claim constraint

## Acceptance Criteria

- [ ] Concurrent claims result in exactly one winner, verified by `pnpm test`
- [ ] Notifications dispatch in enrollment order
- [ ] An unclaimed slot returns to open availability after 30 minutes
- [ ] `pnpm test` passes

## Implementation Notes

Seeded for the `cursor` evaluation lane. Work on the branch cut for this issue and open the pull request against `eval/cursor`. Keep changes limited to the files named in Tasks. This repository puts application code under `app/` (for example `app/lib/`) and tests under `__tests__/`; follow the existing layout rather than creating a parallel tree.

<details>
<summary>Original Issue</summary>

```text
Seeded from eval/rounds/round-16.json, spec `waitlist`, agent `cursor`.
```

</details>
