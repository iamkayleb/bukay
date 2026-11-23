## Round summary (#556)

Re-verified merchant empty states on `cursor/issue-556`. Calendar `DayView` shows
`merchantEmptyMessages.calendarDay` with the `#new-booking` link after loading;
services, clients, payments, and today use `MerchantEmptyState` with shared copy
from `merchant-empty-copy.ts`.

Added Playwright coverage that a fresh merchant sees the intended copy on all five
screens (calendar, clients, services, payments, today).

### Verification

- `pnpm vitest run` — 520 passed
- `pnpm build` — succeeded
- `grep -rn "Nothing here yet" app/` — no matches

All tasks complete; PR ready for review.