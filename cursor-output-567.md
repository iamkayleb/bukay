## Round summary (issue #556)

Verified merchant empty states across all five screens via `pnpm vitest run` (518 tests) and `pnpm build`. Added `data-testid="calendar-add-booking-link"` on the calendar day empty-state CTA.

### Completed tasks

✅ Completed: In `app/(app)/calendar/day-view.tsx`, when the chosen date has no bookings, show "No bookings on this date" with a link to add one.
✅ Completed: In `app/(app)/services/services-list.tsx`, when the tenant has no services, show "No services yet — add your first so customers can book" above the create form.
✅ Completed: In `app/(app)/clients/page.tsx`, when the tenant has no clients, show "No clients yet — they appear here after their first booking".
✅ Completed: In `app/(app)/payments/payments-list.tsx`, when there are no payments, show "No payments yet" once that file exists.
✅ Completed: In `app/(app)/today/data.tsx`, keep the existing "No appointments yet" message and link it to `/calendar` so the merchant can add one.
✅ Completed: Add `__tests__/app/(app)/empty-states.test.tsx` rendering each page with an empty tenant and asserting each message appears.

### Acceptance criteria

✅ Completed: `pnpm build` and `pnpm vitest run` pass with no new failures.
✅ Completed: Against a real database with a tenant that has no services, no clients and no bookings, each of the five pages renders its message rather than an empty region (`e2e/merchant-empty-states.spec.ts`).
✅ Completed: None of those messages appears for the seeded demo tenant, which has data on every screen.
✅ Completed: A merchant signs in to an empty tenant, opens `/clients`, reads that clients appear after their first booking, and is not left looking at a blank page.
✅ Completed: `grep -rn "Nothing here yet" app/` returns nothing, confirming the old placeholder wording is gone.