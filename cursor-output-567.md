## Keepalive round — issue #556

### Task 1 (calendar day-view) — verified
`DayView` shows `merchantEmptyMessages.calendarDay` with `calendar-add-booking-link` → `#new-booking` when the chosen day has no bookings (`day-view.test.tsx`, `issue-556-real-db.test.tsx`).

### This round (code)
- Prefill `NewBookingForm` date from `?date=` so “Add a booking for this date” opens the form on that day (`new-booking-form.test.tsx`).

### Verification
- `pnpm test:merchant-empty-states` — 81 passed
- `pnpm build` — pass (earlier this round)
- `pnpm vitest run` — 543+ passed (earlier this round)
- `grep -rn "Nothing here yet" app/` — no matches