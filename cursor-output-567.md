## Issue #556 — keepalive round 567 (task 1 re-verify)

PR task 1 (`day-view.tsx` empty chosen day):

- Copy: `No bookings on this date` via `merchantEmptyMessages.calendarDay` and add-booking link (`calendarAddBookingHref`)
- `pnpm test:issue-556:pr-task-1` — 14 tests pass
- `pnpm verify:issue-556:pr-task-1` — unit + real SQLite task 1 pass
- Extended `issue-556-task-checklist.test.ts` task 1 to reject loading copy, legacy placeholder, and a bookings list

Full PR gate (tasks 1–6 + acceptance):

- `pnpm verify:issue-556:acceptance-gate` — build + acceptance + empty-states pass
- `pnpm vitest run` — 574 tests pass
- `grep -rn "Nothing here yet" app/` — no matches

All prompt checkboxes marked complete in `cursor-prompt-567.md`.