## Keepalive round summary (issue #556)

### Task 1 (calendar day-view)

**Status:** Verified complete.

- `app/(app)/calendar/day-view.tsx` shows `merchantEmptyMessages.calendarDay` (`No bookings on this date.`) when the settled fetch returns zero bookings, with `Add a booking` → `calendarAddBookingHref(date)` (`?date=…#new-booking`).
- **Checks:** `pnpm verify:issue-556:pr-task-1`, `issue-556-task-checklist.test.ts` (task 1), `day-view.test.tsx`, `empty-states.test.tsx`, `issue-556-real-db.test.tsx`.

### Tasks 2–6

Already on branch; re-verified via `pnpm verify:issue-556:pr-complete` (584 vitest tests, build, grep clean).

### This round

- Pinned `id="calendar-day-empty-message"` in PR task 1 checklist render test (aria-labelledby target).