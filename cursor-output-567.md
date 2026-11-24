## Keepalive round — issue #556

Verified merchant empty states end-to-end:

- `pnpm verify:issue-556:pr-task-1` — calendar day empty copy + add-booking link
- `pnpm verify:issue-556:pr-tasks-1-6` — tasks 1–6 gates
- `pnpm verify:issue-556:acceptance-gate` — build + acceptance + empty-states suite
- `pnpm vitest run` — 565 tests passed

Task 1 (`day-view.tsx`) was already implemented via `MerchantEmptyState`, `merchantEmptyMessages.calendarDay`, and `calendarAddBookingHref`. Strengthened real-DB coverage for the `/clients` acceptance path with `data-testid="clients-empty"`.

All 11 task/acceptance checkboxes marked complete in `cursor-prompt-567.md`.