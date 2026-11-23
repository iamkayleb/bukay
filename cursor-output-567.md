<!-- auto-status-summary:start -->
## Automated Status Summary

**Progress:** 11/11 tasks complete, 0 remaining

### Tasks
- [x] Calendar `day-view.tsx` empty copy with add-booking link (`#new-booking`)
- [x] Services empty copy above create form (`services-list.tsx` on `ServicesPage`)
- [x] Clients empty copy on clients page (`ClientsList` in `page.tsx`)
- [x] Payments empty copy in `payments-list.tsx`
- [x] Today empty copy linked to `/calendar`
- [x] `__tests__/app/(app)/empty-states.test.tsx` covers all five screens

### Acceptance Criteria
- [x] `pnpm build` and `pnpm vitest run` pass locally (495 tests)
- [x] Empty-tenant page renders asserted in tests (server pages + client `DayView`)
- [x] Populated tenant tests assert no empty copy when data exists
- [x] Clients page shows first-booking guidance for empty tenant
- [x] No `Nothing here yet` under `app/`

### Verification (this round)
- `pnpm vitest run __tests__/app/(app)/empty-states.test.tsx`
- `pnpm vitest run` (495 passed)
- `pnpm build`
- `grep -rn "Nothing here yet" app/` → no matches
<!-- auto-status-summary:end -->