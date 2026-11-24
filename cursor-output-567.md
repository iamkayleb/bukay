## Issue #556 — keepalive round 567

Re-verified PR tasks 1–6 and acceptance criteria after checkbox reset.

### Task 1 (`day-view.tsx`)
- Empty chosen day shows `merchantEmptyMessages.calendarDay` and `Add a booking` via `calendarAddBookingHref`.
- Markup: `calendar-day-empty`, `calendar-add-booking-link`, `data-merchant-empty-headline`.
- Task checklist now asserts settled empty day exposes `aria-busy="false"` on the live region.

### Tasks 2–6
- Services, clients, payments, today, and `empty-states.test.tsx` — verified via `pnpm verify:issue-556:pr-tasks-1-6`.

### Gates (this round)
- `pnpm verify:issue-556:pr-complete` — pass
- `pnpm build` — pass
- `pnpm vitest run` — 577 passed
- `grep -rn "Nothing here yet" app/` — no matches

All task and acceptance checkboxes updated in `cursor-prompt-567.md`.