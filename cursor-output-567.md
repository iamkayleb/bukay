## Keepalive round summary (issue #556)

Re-verified task 1: calendar `DayView` empty day UX and added a regression test for changing the selected date.

### Task 1 — calendar day view ✅

- Empty chosen date shows `merchantEmptyMessages.calendarDay` with add-booking link to `#new-booking` (`data-testid="calendar-day-empty"`, `calendar-add-booking-link`).
- New vitest: empty copy persists after picking another date with no bookings.

### Tasks 2–6 ✅

Services, clients, payments, today, and `empty-states.test.tsx` unchanged; covered by vitest.

### Verification (this runner)

- `pnpm verify:issue-556` — pass (build, merchant-empty vitest gate, 523 vitest tests, no legacy copy)
- `pnpm vitest run '__tests__/app/(app)/calendar/day-view.test.tsx'` — 10 tests pass

### Remaining acceptance criterion

- Real-DB e2e: `pnpm test:e2e:merchant-empty-states` (Playwright + DB — UI Acceptance / local requires `pnpm exec playwright install`)