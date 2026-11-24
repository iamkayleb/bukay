## Keepalive round summary (issue #556)

Verified merchant empty states on branch `cursor/issue-556`. `DayView` renders `MerchantEmptyState` with "No bookings on this date." and an in-page **Add a booking** link (`?date=…#new-booking`) when the chosen day has no bookings.

### Verification

- `pnpm verify:issue-556:pr-task-1` — pass
- `pnpm verify:issue-556:pr-tasks-1-6` — pass
- `pnpm verify:issue-556:acceptance-gate` — pass (build + acceptance + empty-states + legacy grep)
- `pnpm vitest run` — 585 tests pass
- `grep -rn "Nothing here yet" app/` — no matches

### Test tweak

- `issue-556-task-checklist.test.ts`: assert `clients/page.tsx` composes `ClientsList` for task 3 page wiring.

### Completed tasks

✅ Completed: In `app/(app)/calendar/day-view.tsx`, when the chosen date has no bookings, show "No bookings on this date" with a link to add one.
✅ Completed: In `app/(app)/services/services-list.tsx`, when the tenant has no services, show "No services yet — add your first so customers can book" above the create form.
✅ Completed: In `app/(app)/clients/page.tsx`, when the tenant has no clients, show "No clients yet — they appear here after their first booking".
✅ Completed: In `app/(app)/payments/payments-list.tsx`, when there are no payments, show "No payments yet" once that file exists.
✅ Completed: In `app/(app)/today/data.tsx`, keep the existing "No appointments yet" message and link it to `/calendar` so the merchant can add one.
✅ Completed: Add `__tests__/app/(app)/empty-states.test.tsx` rendering each page with an empty tenant and asserting each message appears.
✅ Completed: `pnpm build` and `pnpm vitest run` pass with no new failures.
✅ Completed: Against a real database with a tenant that has no services, no clients and no bookings, each of the five pages renders its message rather than an empty region.
✅ Completed: None of those messages appears for the seeded demo tenant, which has data on every screen.
✅ Completed: A merchant signs in to an empty tenant, opens `/clients`, reads that clients appear after their first booking, and is not left looking at a blank page.
✅ Completed: `grep -rn "Nothing here yet" app/` returns nothing, confirming the old placeholder wording is gone.