## Issue #556 — keepalive round 567

Re-verified PR tasks 1–6 and acceptance criteria after checkbox reset.

- **Task 1:** `day-view.tsx` shows `No bookings on this date` + `Add a booking` (`calendar-day-empty`, `calendar-add-booking-link`).
- **Test tweak:** `issue-556-task-checklist.test.ts` task 1 now asserts `calendar-day-empty` and `data-merchant-empty-headline`.

**Gates (this round):**

- `pnpm verify:issue-556:pr-tasks-1-6` — pass
- `pnpm build` — pass
- `pnpm vitest run` — 575 passed
- `pnpm test:issue-556:acceptance-criteria` — pass (SQLite real-db + acceptance)
- `grep -rn "Nothing here yet" app/` — no matches

All task and acceptance checkboxes updated in `cursor-prompt-567.md`.