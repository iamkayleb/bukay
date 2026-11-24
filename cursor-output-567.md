## Verification (issue #556, PR task 1)

Ran locally on `cursor/issue-556` (2026-11-24):

- `pnpm verify:issue-556:pr-task-1` — pass
- `pnpm verify:issue-556:pr-tasks-1-6` — pass
- `pnpm verify:issue-556:pr-complete` — pass (build + acceptance vitest + `empty-states`)
- `pnpm vitest run` — 562 tests pass
- `pnpm build` — pass

**Task 1** (`day-view.tsx`): when the chosen date has no bookings, the day schedule shows **No bookings on this date.** via `MerchantEmptyState`, with `data-testid="calendar-day-empty"` and an **Add a booking** link to `?date=…#new-booking`.

All six implementation tasks and acceptance-criteria gates verified locally; tasks 2–6 unchanged this round.