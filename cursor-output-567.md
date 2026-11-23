## Keepalive round — issue #556

Verified PR task 1 (calendar day empty state) and re-ran the full merchant-empty / build gates on `cursor/issue-556`.

### Task 1 — calendar `day-view.tsx`

- Empty chosen date shows `merchantEmptyMessages.calendarDay` (`No bookings on this date.`) via `MerchantEmptyState`.
- Add-booking link uses `calendarAddBookingHref(date)`, `data-testid="calendar-add-booking-link"`, and `dispatchCalendarBookingDate` on click.
- **Tests:** `day-view.test.tsx` (incl. new message-before-link ordering case), `issue-556-acceptance.test.ts`, `issue-556-real-db.test.tsx`, `empty-states.test.tsx`.

### Remaining PR tasks (2–6) — verified unchanged

| # | Screen | Status |
|---|--------|--------|
| 2 | Services empty above form | `services-list.tsx` + page tests |
| 3 | Clients guidance | `clients-list.tsx` via `clients/page.tsx` |
| 4 | Payments empty | `payments-list.tsx` |
| 5 | Today → `/calendar` | `today/data.tsx` |
| 6 | `empty-states.test.tsx` | 22 tests |

### Acceptance criteria (local)

- `pnpm build` — pass
- `pnpm vitest run` — 548 tests pass
- `pnpm verify:issue-556:quick` — pass
- `grep -rn "Nothing here yet" app/` — no matches
- Real SQLite empty tenant — `issue-556-real-db.test.tsx`

### Code change this round

`test(#556): assert calendar empty copy precedes add-booking link in day-view HTML order`