## Keepalive round — issue #556

Verified PR task 1 (calendar day empty state) and full scope on `cursor/issue-556`.

### PR task 1

`DayView` shows `merchantEmptyMessages.calendarDay` (“No bookings on this date.”) plus an “Add a booking” link via `calendarAddBookingHref` when the chosen date has zero bookings (`data-testid="calendar-day-empty"`).

### Verification

- `pnpm test:issue-556:pr-task-1` — pass
- `pnpm verify:issue-556:quick` — pass (87 merchant-empty tests)
- `pnpm build` — pass
- `pnpm vitest run` — 550 tests pass
- `grep -rn "Nothing here yet" app/` — no matches

### Tasks 1–6 and acceptance

All six implementation tasks and five acceptance criteria are satisfied in code and tests (`issue-556-acceptance`, `empty-states`, `day-view`, `issue-556-real-db`).

### Code change this round

- `package.json`: add `test:issue-556:pr-task-1` gate for calendar day empty state
- `issue-556-acceptance.test.ts`: assert the PR task 1 script is defined