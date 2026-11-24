## Keepalive round summary (#567 / issue #556)

### Verified this round
- **PR task 1 (calendar day-view):** `DayView` shows `merchantEmptyMessages.calendarDay` and an “Add a booking” link when the chosen date has no bookings (`app/(app)/calendar/day-view.tsx`).
- **PR tasks 2–6:** Empty states on services, clients, payments, today, and `empty-states.test.tsx` — covered by `pnpm verify:issue-556:pr-tasks-1-6`.
- **Acceptance:** `pnpm vitest run` (558 tests), `pnpm build`, real-DB `issue-556-real-db.test.tsx`, demo-tenant guards in acceptance tests, `grep` for legacy “Nothing here yet” — all green.

### Code change
- `package.json`: `test:issue-556:pr-task-1` now runs the full `day-view.test.tsx` suite so PR task 1 smoke tests run under CI `verify:issue-556:pr-task-1` (previously only tests titled `issue #556` ran).

### Commands
```bash
pnpm verify:issue-556:pr-task-1
pnpm verify:issue-556:pr-tasks-1-6
pnpm vitest run
pnpm build
```

**Progress:** 11/11 tasks and acceptance criteria marked complete in `cursor-prompt-567.md`.