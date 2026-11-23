## Round summary (#556)

Verified merchant empty states on `cursor/issue-556` and added colocated `DayView` tests.

### Verification
- `pnpm vitest run` — 499 tests passed (including new calendar day-view tests)
- `pnpm build` — succeeded
- `grep -rn "Nothing here yet" app/` — no matches

### Implementation (already on branch)
- `day-view.tsx` — `MerchantEmptyState` with calendar copy and `#new-booking` link
- `services-list.tsx`, `clients-list.tsx`, `payments-list.tsx`, `today/data.tsx` — shared empty copy via `merchant-empty-copy.ts`
- `__tests__/app/(app)/empty-states.test.tsx` — five-page empty + populated tenant coverage

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