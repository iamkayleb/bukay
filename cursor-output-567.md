## Round summary (#556)

### Verified locally
- `pnpm vitest run` — 506 tests passed (`empty-states.test.tsx`, `day-view.test.tsx`, page shell tests)
- `pnpm build` — succeeded
- `grep -rn "Nothing here yet" app/` — no matches

### Implementation
- Calendar `DayView`: `MerchantEmptyState` with `merchantEmptyMessages.calendarDay` and add-booking link → `#new-booking` (`aria-label="Day schedule"`)
- `ServicesList`, `ClientsList`, `PaymentsList`, `TodaySchedule`: shared `MerchantEmptyState` + `merchant-empty-copy.ts`
- `__tests__/app/(app)/empty-states.test.tsx` covers all five merchant screens (empty + demo tenants)
- `e2e/merchant-empty-states.spec.ts` exercises fresh sign-in and demo tenant paths against a real database

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