## Completed this run

Verified **task 1** (calendar day view empty state) on `cursor/issue-556`:

- Empty days render `MerchantEmptyState` with "No bookings on this date." and an in-page **Add a booking** link (`href="#new-booking"`).
- Wrapped the empty state in a `Day schedule` landmark (`role="region"`) so the calendar day area is identifiable when empty.
- `pnpm vitest run '__tests__/app/(app)/empty-states.test.tsx'` — 16 passed.
- `pnpm build` — success.

## Tasks completed

- [x] Calendar day view: "No bookings on this date." + Add a booking link
- [ ] Services list empty copy above create form
- [ ] Clients page empty copy via `ClientsList`
- [ ] Payments list: "No payments yet."
- [ ] Today schedule: "No appointments yet." linked to `/calendar`
- [ ] `empty-states.test.tsx` covers empty-tenant pages and copy inventory

## Acceptance criteria

- [x] Build and targeted empty-state tests green this run
- [ ] Full `pnpm vitest run`
- [ ] Empty-tenant rendering against real database
- [ ] Populated demo tenant hides empty copy
- [ ] Clients empty message on `/clients`
- [x] Legacy "Nothing here yet" removed from `app/`

**Progress:** 1/11 tasks complete, 10 remaining