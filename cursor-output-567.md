# Keepalive round 567 — issue #556 merchant empty states

## Task 1 (calendar day-view)

- `DayView` renders `MerchantEmptyState` with `merchantEmptyMessages.calendarDay` and link
  `merchantEmptyHrefs.calendarAddBooking` (`#new-booking`) when `bookings.length === 0` after load.
- Verified: `pnpm vitest run __tests__/app/(app)/calendar/day-view.test.tsx` (5 tests).

## All tasks / acceptance

| Check | Evidence |
|-------|----------|
| Build + unit tests | `pnpm build` OK; `pnpm vitest run` — 512 tests passed |
| Five empty messages | `__tests__/app/(app)/empty-states.test.tsx` — `renders each page with an empty tenant...` |
| Demo tenant has no empty copy | Same file — `populated tenant` + `e2e/merchant-empty-states.spec.ts` |
| Fresh merchant `/clients` | E2E `fresh merchant sees clients empty copy...` |
| No "Nothing here yet" | `empty-states.test.tsx` grep test + `rg` locally empty |

## Commit this round

- Regression test: calendar empty copy confined to `aria-label="Day schedule"` region.