# Keepalive round — issue #556 merchant empty states

## Verified this round

| Gate | Result |
|------|--------|
| `pnpm build` | pass |
| `pnpm vitest run` | 90 files, 582 tests pass |
| `pnpm verify:issue-556:pr-complete` | pass |
| `pnpm verify:issue-556:pr-task-1` | pass |
| `grep -rn "Nothing here yet" app/` | no matches |

## Task 1 (`day-view.tsx`)

When the chosen date has zero bookings (after load, no error), the day schedule shows `No bookings on this date.` via `MerchantEmptyState`, with **Add a booking** linking to `?date=YYYY-MM-DD#new-booking` and `dispatchCalendarBookingDate` on click.

## PR tasks 1–6 and acceptance criteria

All six implementation tasks and five acceptance criteria verified locally, including `issue-556-real-db.test.tsx`.