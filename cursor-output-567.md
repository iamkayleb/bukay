## Keepalive round — issue #556 (re-verified)

### Task 1 (calendar day-view)
Verified `DayView` shows `merchantEmptyMessages.calendarDay` ("No bookings on this date.") with `calendar-add-booking-link` → `#new-booking` when the chosen day has no bookings. Covered by `day-view.test.tsx`, `empty-states.test.tsx`, and `issue-556-acceptance.test.ts` PR task 1 cases.

### Tasks (all six PR tasks — implementation on branch)
- [x] Calendar `day-view.tsx`: empty-day copy + add-booking link
- [x] Services: empty copy above create form
- [x] Clients: empty copy on page
- [x] Payments: "No payments yet"
- [x] Today: empty copy linked to `/calendar`
- [x] `empty-states.test.tsx`: all five screens

### Acceptance criteria (verified this round)
- [x] `pnpm build` — pass
- [x] `pnpm vitest run` — 542 passed
- [x] `pnpm verify:issue-556:quick` — pass
- [x] `issue-556-real-db.test.tsx` — pass
- [x] `grep -rn "Nothing here yet" app/` — no matches
- [x] Demo tenant tests — no empty copy when data present

### This round
Re-ran build and full vitest locally; pinned `verify:issue-556` package script in acceptance tests so the local merge gate stays aligned with acceptance criterion 1.