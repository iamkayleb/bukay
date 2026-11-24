# Keepalive round 567 — issue #556

## Progress: 1/11 tasks verified this round

### Task 1 — calendar `day-view.tsx`

Verified `pnpm verify:issue-556:pr-task-1`:

- Empty chosen date shows **No bookings on this date** (`merchantEmptyMessages.calendarDay`) and **Add a booking** link to `?date=…#new-booking`.
- Real SQLite empty tenant reproduces the same UI (including `calendar-day-empty-message` label wiring).
- `pnpm build` and full `pnpm vitest run` (565 tests) pass.

### Remaining

PR tasks 2–6 and acceptance criteria unchanged; implementation already on branch from prior commits.