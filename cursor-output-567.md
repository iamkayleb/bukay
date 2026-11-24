## Keepalive round — issue #556

Re-verified PR task 1 and full scope on `cursor/issue-556`.

### PR task 1 (calendar day)

`DayView` renders `merchantEmptyMessages.calendarDay` (“No bookings on this date.”) and an add-booking link via `calendarAddBookingHref` when the chosen date has zero bookings (`data-testid="calendar-day-empty"`).

### Verification

- `pnpm test:issue-556:pr-task-1` — pass
- `pnpm test:issue-556:acceptance-criteria` — pass
- `pnpm verify:issue-556:quick` — pass (88 merchant-empty tests)
- `pnpm build` — pass
- `pnpm vitest run` — 551 tests pass
- `grep -rn "Nothing here yet" app/` — no matches

### Tasks 1–6 and acceptance

All six implementation tasks and five acceptance criteria are satisfied in code and tests (`issue-556-acceptance`, `empty-states`, `day-view`, `issue-556-real-db`).

### Code change this round

- `package.json`: add `test:issue-556:acceptance-criteria` for acceptance + real-db gates
- `issue-556-acceptance.test.ts`: assert the new script and build/vitest verify gate