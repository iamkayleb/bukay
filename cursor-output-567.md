## Round summary

Verified PR task 1 (calendar day empty state) on `cursor/issue-556`. Implementation was already present in `day-view.tsx`; this round re-ran `pnpm verify:issue-556:pr-task-1` and `pnpm verify:issue-556:acceptance-gate` (build + acceptance + empty-states + legacy copy grep).

### Source change
- Pin `verify:issue-556:pr-task-1` in `issue-556-acceptance.test.ts` so the unit + real-db gate cannot be dropped from `package.json`.

### Verified behavior (task 1 / calendar)
- Empty chosen date renders `MerchantEmptyState` with **No bookings on this date.** and an add-booking link (`calendarAddBookingHref` + `#new-booking`).