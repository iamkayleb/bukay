## Issue #556 — keepalive round 567

Re-verified PR task 1 (`day-view.tsx` empty chosen day) and full #556 gate:

- Empty day: `No bookings on this date` + `Add a booking` link (`calendarAddBookingHref`, `data-testid="calendar-day-empty"`)
- `pnpm verify:issue-556:pr-task-1` — pass
- `pnpm verify:issue-556:pr-complete` — pass (build, 574 vitest tests, acceptance + real SQLite)
- `pnpm vitest run` — 574 passed
- `grep -rn "Nothing here yet" app/` — no matches

Extended `issue-556-task-checklist.test.ts` with demo-tenant calendar day guard (bookings present → no empty copy).

Tasks 1–6 and all acceptance criteria verified; checkboxes updated in `cursor-prompt-567.md`.