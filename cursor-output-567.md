## Keepalive round summary (issue #556)

Re-ran `pnpm verify:issue-556` locally after broadening `test:merchant-empty-states` with `calendar/page.test.tsx` so the calendar empty-state link target (`#new-booking`) is part of the focused gate.

### Task 1 — calendar day view ✅

- `DayView` shows `merchantEmptyMessages.calendarDay` and an add-booking link to `#new-booking` when the day has no bookings.
- Verified: `day-view.test.tsx` (8), `calendar/page.test.tsx` (2), `empty-states.test.tsx` (22), full suite (521).

### Remaining PR tasks (2–6)

Implemented on branch; covered by `empty-states.test.tsx`, page/list tests, and `e2e/merchant-empty-states.spec.ts`.

### Acceptance criteria

- [x] `pnpm build` + `pnpm vitest run` — pass
- [x] Legacy `Nothing here yet` — absent under `app/`
- [ ] Real-DB e2e — run via `pnpm test:e2e:merchant-empty-states` in UI acceptance (not executed this round)