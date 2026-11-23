## Round summary (#556)

### Verified locally
- `pnpm vitest run` — 504 tests passed (includes `empty-states.test.tsx`, `day-view.test.tsx`, `merchant-empty-state.test.tsx`)
- `pnpm build` — succeeded (clean `.next` rebuild)
- `grep -rn "Nothing here yet" app/` — no matches

### Implementation
- Calendar `DayView`: `MerchantEmptyState` with `merchantEmptyMessages.calendarDay` and add-booking link → `#new-booking`
- `ServicesList`, `ClientsList`, `PaymentsList`, `TodaySchedule`: shared `MerchantEmptyState` + `merchant-empty-copy.ts`
- `__tests__/app/(app)/empty-states.test.tsx` covers all five merchant screens (empty + demo tenants)
- `e2e/merchant-empty-states.spec.ts` exercises real DB sign-in paths

### Task status (11/11)
- [x] Calendar day-view empty copy + add-booking link
- [x] Services list empty copy above create form
- [x] Clients page empty copy
- [x] Payments list empty copy
- [x] Today schedule empty copy linked to `/calendar`
- [x] `empty-states.test.tsx` covers all five screens
- [x] `pnpm build` and `pnpm vitest run` pass
- [x] E2E against real database
- [x] Demo tenant excludes empty copy when data exists
- [x] Fresh merchant `/clients` empty copy
- [x] No `Nothing here yet` under `app/`