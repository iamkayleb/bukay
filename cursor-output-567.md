## Keepalive round summary (#556)

Completed merchant empty-state work on `cursor/issue-556`.

### Task 1 (calendar day view) — verified
- `DayView` renders `MerchantEmptyState` with `merchantEmptyMessages.calendarDay` when the selected day has zero bookings (after loading finishes).
- Action links to `#new-booking` on the calendar page via `merchantEmptyActions.calendarAddBooking`.

### All tasks / acceptance criteria
- Five screens use shared copy in `merchant-empty-copy.ts` and `MerchantEmptyState`.
- `__tests__/app/(app)/empty-states.test.tsx` covers empty and populated tenants (20 cases).
- Local gates: `pnpm vitest run` (492 passed), `pnpm build` succeeded.

### Commit this round
- Centralized empty-state action link labels in `merchantEmptyActions` for calendar and today screens.