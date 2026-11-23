## Completed this run

Re-verified issue #556 merchant empty states on `cursor/issue-556`:

- **Task 1 (calendar day view):** Empty days show `MerchantEmptyState` with "No bookings on this date." and an in-page link (`href="#new-booking"`, "Add a booking"); `#new-booking` form uses `scroll-mt-8` so the anchor lands clearly below the header.
- All five screens use `MerchantEmptyState` with the issue copy; today links to `/calendar`.
- `pnpm build` and `pnpm vitest run` (488 tests) pass locally.
- `__tests__/app/(app)/empty-states.test.tsx` (16 tests) covers empty and populated tenants plus `grep` for legacy copy.
- `grep -rn "Nothing here yet" app/` returns no matches.

## Tasks completed

- [x] Calendar day view: "No bookings on this date." + Add a booking link (`empty-states.test.tsx` jsdom)
- [x] Services list empty copy above create form
- [x] Clients page empty copy via `ClientsList`
- [x] Payments list: "No payments yet."
- [x] Today schedule: "No appointments yet." linked to `/calendar`
- [x] `empty-states.test.tsx` covers empty-tenant pages and copy inventory

## Acceptance criteria

- [x] Build and unit tests green
- [x] Empty-tenant rendering covered by SSR tests + `DayView` jsdom test
- [x] Populated tenant does not show empty copy
- [x] Clients empty message on `/clients`
- [x] Legacy "Nothing here yet" removed from `app/`

**Progress:** 11/11 tasks complete, 0 remaining