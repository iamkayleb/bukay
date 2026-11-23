## Keepalive round — issue #556

### Task 1 (calendar day-view) — verified
`DayView` shows `merchantEmptyMessages.calendarDay` with date-aware `calendarAddBookingHref(date)` and in-page `dispatchCalendarBookingDate` so the new-booking form prefills the merchant’s chosen day (including after changing the date picker).

### Verification
- `pnpm verify:issue-556:quick` — 82 passed
- `grep -rn "Nothing here yet" app/` — no matches