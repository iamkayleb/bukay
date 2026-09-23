<!-- base-branch: eval/codex -->
<!-- eval-round: 4 -->
<!-- eval-spec: business-hours -->
<!-- eval-agent: codex -->

## Why

The availability engine cannot compute slots without a source of truth for opening times.

## Scope

Per-tenant weekly schedule with multiple windows per weekday, plus date-specific overrides.

## Non-Goals

Nothing beyond the scope above. Do not modify files under `.github/`.

## Tasks

- [ ] Add `prisma/schema.prisma`: add `BusinessHour` and `Blackout` models
- [ ] Add `app/(app)/settings/hours/page.tsx`: build the schedule editor
- [ ] Add `lib/hours.ts`: implement `getOpenWindows()`
- [ ] Add `tests/hours.test.ts` covering multi-window days and blackouts

## Acceptance Criteria

- [ ] Different hours per weekday persist and are verified by `pnpm test`
- [ ] A blackout date causes `getOpenWindows()` to return an empty array
- [ ] `lib/hours.ts` exports `getOpenWindows` for the availability engine
- [ ] `pnpm test` passes

## Implementation Notes

Seeded for the `codex` evaluation lane. Work on the branch cut for this issue and open the pull request against `eval/codex`. Keep changes limited to the files named in Tasks.

<details>
<summary>Original Issue</summary>

```text
Seeded from eval/rounds/round-04.json, spec `business-hours`, agent `codex`.
```

</details>
