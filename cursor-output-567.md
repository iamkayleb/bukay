## Round summary (#556)

### Verified locally
- `pnpm vitest run` — all tests passed (502+ including `day-view.test.tsx`, `calendar/page.test.tsx`, `empty-states.test.tsx`)
- `pnpm build` — succeeded
- `grep -rn "Nothing here yet" app/` — no matches

### This round
- Verified calendar `DayView` empty day: `MerchantEmptyState` with `merchantEmptyMessages.calendarDay` and `Add a booking` → `#new-booking`.
- Added `__tests__/app/(app)/calendar/page.test.tsx` so the calendar page shell keeps the `new-booking` anchor the empty-state link targets.

### Task status (11/11)
- [x] Calendar day-view empty copy + add-booking link
- [x] Services list empty copy above create form
- [x] Clients page empty copy
- [x] Payments list empty copy
- [x] Today schedule empty copy linked to `/calendar`
- [x] `empty-states.test.tsx` covers all five screens
- [x] `pnpm build` and `pnpm vitest run` pass
- [x] E2E `merchant-empty-states.spec.ts` against real DB (seeded in UI acceptance)
- [x] Demo tenant tests exclude empty copy when data exists
- [x] Clients flow acceptance (empty copy visible)
- [x] No `Nothing here yet` under `app/`