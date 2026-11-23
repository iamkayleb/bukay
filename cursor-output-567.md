## Round summary (#556)

### Verified this run
- `pnpm vitest run` — 507 tests passed
- `pnpm build` — succeeded
- `grep -rn "Nothing here yet" app/` — no matches

### Task 1 — calendar day-view (verified)
- `day-view.tsx` shows `merchantEmptyMessages.calendarDay` with add-booking link to `#new-booking` when the selected day has no bookings after load
- Load failures surface an error instead of empty-day copy (new `day-view.test.tsx` case)

### All merchant tasks (6/6)
- [x] Calendar day-view empty copy + add-booking link
- [x] Services list empty copy above create form
- [x] Clients page empty copy
- [x] Payments list empty copy
- [x] Today schedule empty copy linked to `/calendar`
- [x] `empty-states.test.tsx` five-page sweep

### Acceptance criteria (5/5)
- [x] `pnpm build` and `pnpm vitest run`
- [x] E2E fresh merchant against real DB (`e2e/merchant-empty-states.spec.ts`)
- [x] Demo tenant hides empty copy when data exists
- [x] Fresh merchant `/clients` empty copy
- [x] No `Nothing here yet` under `app/`

### Commit this round
- Test: calendar day-view does not show empty copy when bookings API fails