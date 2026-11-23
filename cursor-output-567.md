## Keepalive round — issue #556 (verified complete)

### Task 1 — calendar `day-view.tsx`
- **Already implemented:** empty chosen date renders `MerchantEmptyState` with `No bookings on this date.` and `Add a booking` linking to `#new-booking` (anchor on `new-booking-form.tsx`).
- **Verification:** `day-view.test.tsx` (10/10), `issue-556-acceptance` PR task 1, `issue-556-real-db` task 1, Playwright `merchant-empty-states.spec.ts`.

### Tasks 2–6
Shared `merchant-empty-copy.ts` + `MerchantEmptyState`; covered by `empty-states.test.tsx` (22 tests) and per-page tests.

### This round
- Re-ran `pnpm verify:issue-556:quick`, `pnpm vitest run` (539 passed), `pnpm build` (success).
- Added acceptance test guarding CI `test:merchant-empty-states` / `verify:issue-556:quick` wiring.

### Commands
```bash
pnpm verify:issue-556:quick
pnpm vitest run
pnpm build
bash -c '! grep -rn "Nothing here yet" app/'
```