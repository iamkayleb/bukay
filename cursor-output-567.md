## Issue #556 — keepalive round 567

Re-verified PR tasks 1–6 and acceptance criteria after checkbox reset.

### Task 1 (`day-view.tsx`)
- Empty chosen day shows `merchantEmptyMessages.calendarDay` and `Add a booking` via `calendarAddBookingHref`.
- Markup: `calendar-day-empty`, `calendar-add-booking-link`, `data-merchant-empty-headline`.

### This round
- **Test:** `issue-556-real-db` demo tenant asserts calendar does not render empty-day test ids or headline copy.

### Gates (this round)
- `pnpm verify:issue-556:pr-complete` — pass
- `pnpm build` — pass
- `pnpm vitest run` — 575 passed
- `grep -rn "Nothing here yet" app/` — no matches

All task and acceptance checkboxes updated in `cursor-prompt-567.md`.