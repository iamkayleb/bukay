## Round summary (#556)

### Verified locally
- `pnpm vitest run` — 502 tests passed (including `empty-states.test.tsx`, `day-view.test.tsx`, `today/page.test.tsx`)
- `pnpm build` — succeeded
- `grep -rn "Nothing here yet" app/` — no matches

### This round
- Centralized merchant empty-state link targets in `merchant-empty-copy.ts` (`merchantEmptyHrefs`) and wired `day-view.tsx` + `today/data.tsx` to use them.
- Re-ran targeted vitest suites for calendar, today, and empty-state coverage.

### Task status
All six implementation tasks and five acceptance criteria verified on branch `cursor/issue-556`.