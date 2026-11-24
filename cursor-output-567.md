## Round summary

Re-verified issue #556 merchant empty states after prompt reset. All six PR tasks were already implemented on `cursor/issue-556`; this round confirmed them with `pnpm build`, `pnpm vitest run` (553 tests), `pnpm verify:issue-556:pr-task-1`, and the new `pnpm verify:issue-556:acceptance-gate`.

### Source change
- Added `verify:issue-556:acceptance-gate` in `package.json` for a focused build + acceptance + empty-states + legacy-copy grep check.

### Verified behavior (task 1 / calendar)
- Empty chosen date renders `MerchantEmptyState` with `No bookings on this date.` and an add-booking link prefilled via `calendarAddBookingHref`.