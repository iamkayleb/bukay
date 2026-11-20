## Completed this run

Verified issue #556 merchant empty states on `cursor/issue-556`:

- `MerchantEmptyState` used on calendar day view, services, clients, payments, and today screens with the specified copy and actions (`#new-booking`, `/calendar`).
- `pnpm build` and `pnpm vitest run` (488 tests) pass locally.
- `grep -rn "Nothing here yet" app/` returns no matches; populated-tenant tests assert demo data hides empty copy.

## Tasks completed

- [x] Calendar day view: "No bookings on this date." + Add a booking link (`day-view.test.tsx`)
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