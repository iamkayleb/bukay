## Round summary (#556)

### Verified locally
- `pnpm vitest run` — 501 tests passed (including `empty-states.test.tsx` and `day-view.test.tsx`)
- `pnpm build` — succeeded
- `grep -rn "Nothing here yet" app/` — no matches

### First task (calendar day view)
Already implemented in `day-view.tsx` via `MerchantEmptyState`, copy in `merchant-empty-copy.ts`, and `href="#new-booking"` link.

### This round
- Added Playwright coverage: seeded demo owner does not see merchant empty copy on clients, services, payments, or the pinned calendar day (`e2e/merchant-empty-states.spec.ts`).

### All PR tasks and acceptance criteria
Marked complete in `cursor-prompt-567.md` after verification above.