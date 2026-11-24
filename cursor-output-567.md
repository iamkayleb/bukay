# Keepalive round — PR #567 / issue #556

## Task 1 (calendar day-view)

- **Requirement:** Empty chosen date → "No bookings on this date" + link to add a booking.
- **Implementation:** `app/(app)/calendar/day-view.tsx` uses `MerchantEmptyState` with `merchantEmptyMessages.calendarDay` and `calendarAddBookingHref(date)`.
- **Verification:** `pnpm run verify:issue-556:pr-task-1`, `issue-556-task-checklist` task 1, `day-view.test.tsx`, `empty-states.test.tsx`, `issue-556-real-db` task 1.

## Full PR gate (this round)

| Check | Result |
|-------|--------|
| `pnpm build` | pass |
| `pnpm vitest run` | 90 files, 580 tests pass |
| `pnpm run verify:issue-556:pr-tasks-1-6` | pass |
| `grep -rn "Nothing here yet" app/` | no matches |

## Commit

- Added source-contract test for task 1 in `issue-556-task-checklist.test.ts`.
- Updated `cursor-prompt-567.md` checkboxes to 11/11 complete.