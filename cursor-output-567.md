## Round summary (#556)

### Verified this run
- `pnpm vitest run` — 506 tests passed
- `pnpm build` — succeeded
- `grep -rn "Nothing here yet" app/` — no matches

### Task 1 — calendar day-view (verified)
- `day-view.tsx` shows `merchantEmptyMessages.calendarDay` with add-booking link to `#new-booking` when the selected day has no bookings after load
- E2E now follows the empty-state link and asserts the `#new-booking` form is visible

### All merchant tasks (6/6)
- [x] Calendar day-view empty copy + add-booking link
- [x] Services list empty copy above create form
- [x] Clients page empty copy
- [x] Payments list empty copy
- [x] Today schedule empty copy linked to `/calendar`
- [x] `empty-states.test.tsx` five-page sweep

### Acceptance criteria (5/5)
- [x] `pnpm build` and `pnpm vitest run`
- [x] E2E fresh merchant against real DB
- [x] Demo tenant hides empty copy when data exists
- [x] Fresh merchant `/clients` empty copy
- [x] No `Nothing here yet` under `app/`

### Commit this round
- E2E: follow calendar empty-state add link to `#new-booking` form