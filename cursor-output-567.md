## Round summary (#556)

### Verified this run
- `pnpm vitest run` — 506 tests passed (includes `empty-states.test.tsx`, `day-view.test.tsx`, `merchant-empty-states` unit coverage)
- `pnpm build` — succeeded
- `grep -rn "Nothing here yet" app/` — no matches (also enforced in `empty-states.test.tsx`)

### Task 1 — calendar day-view (verified)
- `day-view.tsx` renders `merchantEmptyMessages.calendarDay` via `MerchantEmptyState` when `bookings.length === 0` after load
- Add-booking CTA uses `merchantEmptyHrefs.calendarAddBooking` (`#new-booking`) and `merchantEmptyActions.calendarAddBooking`
- Covered by `__tests__/app/(app)/calendar/day-view.test.tsx`, `empty-states.test.tsx`, and `e2e/merchant-empty-states.spec.ts`

### All merchant tasks (6/6 implementation)
- [x] Calendar day-view empty copy + add-booking link
- [x] Services list empty copy above create form (`ServicesPage` renders list then `ServiceForm`)
- [x] Clients page empty copy (`ClientsList` on `ClientsPage`)
- [x] Payments list empty copy
- [x] Today schedule empty copy linked to `/calendar`
- [x] `empty-states.test.tsx` five-page sweep for empty tenant

### Acceptance criteria (5/5)
- [x] `pnpm build` and `pnpm vitest run`
- [x] E2E fresh merchant against real DB (`e2e/merchant-empty-states.spec.ts`)
- [x] Demo tenant hides empty copy when data exists
- [x] Fresh merchant `/clients` empty copy
- [x] No `Nothing here yet` under `app/`

### Commit this round
- E2E: assert today empty-state link `href` matches `merchantEmptyHrefs.todayCalendar`