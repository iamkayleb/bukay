<!-- base-branch: eval/codex -->
<!-- eval-round: 16 -->
<!-- eval-spec: waitlist -->
<!-- eval-agent: codex -->

## Why

Refilling cancelled slots automatically recovers revenue the merchant would otherwise lose.

## Scope

On cancellation, notify waitlisted clients in order; the first to pay keeps the slot.

**Allowed paths:**

- `app/[slug]/book/**`
- `app/lib/**`
- `app/lib/agent/tools/**`
- `prisma/**`
- `__tests__/**` and `tests/**` for the tests that prove the criteria
- `prisma/schema.prisma` and `prisma/migrations/**` when the work needs schema support
- `docs/**` for documentation the change makes stale
- `.agents/**`, `package.json`, `package-lock.json` and `pnpm-lock.yaml` as toolchain output

## Non-Goals

Nothing beyond the scope above. Leave repository automation configuration untouched.

## Tasks

- [ ] Add `prisma/schema.prisma`: add the `Waitlist` model
- [ ] Add `app/[slug]/book/page.tsx`: implement waitlist enrollment
- [ ] Add `app/lib/agent/tools/waitlist.ts`: expose the waitlist tool
- [ ] Add `app/lib/waitlist.ts`: implement the dispatcher
- [ ] Add `prisma/migrations/`: add a unique claim constraint

## Acceptance Criteria

- [ ] Concurrent claims result in exactly one winner, verified by `pnpm test`
- [ ] Notifications dispatch in enrollment order
- [ ] An unclaimed slot returns to open availability after 30 minutes
- [ ] `pnpm test` passes

## Implementation Notes

Seeded for the codex evaluation lane. Work on the branch cut for this issue and open the pull request against the codex lane branch. Keep changes within the allowed paths listed under Scope; the acceptance verifier reports anything outside them as out of scope. Application code lives under the app directory and tests under the repository test directory; follow the existing layout rather than starting a parallel tree.

<details>
<summary>Original Issue</summary>

```text
Seeded from the round 16 specification, spec waitlist, agent codex.
```

</details>
