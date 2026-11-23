## Run summary

Verified merchant empty states on branch `cursor/issue-556` for issue #556.

### Task progress

- [x] Calendar (`day-view.tsx`): empty day shows "No bookings on this date." and `Add a booking` → `#new-booking`
- [x] Services (`services-list.tsx`): empty copy above `ServiceForm` on `/services`
- [x] Clients (`ClientsList` via `page.tsx`): empty copy above `ClientForm` on `/clients`
- [x] Payments (`payments-list.tsx`): "No payments yet." on `/payments`
- [x] Today (`data.tsx`): "No appointments yet." with link to `/calendar`
- [x] Tests (`empty-states.test.tsx`): empty tenant, demo tenant, legacy grep guard, `DayView` fetch + loading guard

### Verification

- `pnpm vitest run` — 490 passed (including new calendar loading guard)
- `pnpm vitest run '__tests__/app/(app)/empty-states.test.tsx'` — 18 passed
- `pnpm build` — succeeded
- `grep -rn "Nothing here yet" app/` — no matches (also asserted in tests)

**Progress:** 11/11 tasks complete, 0 remaining