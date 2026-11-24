# Keepalive round 567 — issue #556

## Task 1 (calendar day empty state)

**Status:** Verified complete.

- `app/(app)/calendar/day-view.tsx` shows `merchantEmptyMessages.calendarDay` (“No bookings on this date.”) with an add-booking link when the day fetch settles with zero bookings (after loading/error branches).
- Gates: `pnpm verify:issue-556:pr-task-1` (14 day-view tests + real-db `task 1`).

## Verification (this round)

| Command | Result |
|---------|--------|
| `pnpm verify:issue-556:pr-task-1` | pass |
| `pnpm vitest run __tests__/app/(app)/issue-556-acceptance.test.ts -t "PR task 1"` | pass |