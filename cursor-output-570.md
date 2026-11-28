## Progress: 10/10 tasks complete

### Tasks (verified)

- [x] In `app/(app)/today/data.tsx`, `getTodaySummary` / `getTodaySummaryFigures` / `queryTodaySummaryFigures` return today's booking count, paid `amountCents` sum (by payment `createdAt`), and unpaid booking count.
- [x] Day boundaries use `zonedDayRange` via `resolveTenantDayContext`; schedule list and summary share `loadTodayScheduleData`.
- [x] `app/(app)/today/summary.tsx` — `TodaySummaryPanel` with three labeled figures.
- [x] Summary rendered above the list in `TodaySchedule` (`data.tsx`).
- [x] `__tests__/app/(app)/today/summary.test.ts` — real DB: bookings/payments, empty day (`[AC-3]`), timezone boundary.

### Acceptance criteria (verified)

- [x] `pnpm build` and `pnpm vitest run` — pass (run 2026-11-28; 517 tests, `DATABASE_URL=file:./dev.db`).
- [x] `[AC-2]` Seeded DB + one today booking → `bookingsCount` 1 (`summary.test.ts`, `page.test.tsx`).
- [x] `[AC-3]` Empty day shows zeros; summary section still present.
- [x] `[AC-4]` Pending payment → unpaid, not money taken.
- [x] `[AC-5]` Vitest real-DB increment test; Playwright `e2e/today.spec.ts` calendar → today journey.

### This round

- Re-verified `pnpm build`, full `pnpm vitest run` (517 tests), and `__tests__/app/(app)/today/summary.test.ts`.
- Added test asserting `queryTodaySummaryFigures` matches `getTodaySummaryFigures` for the same tenant day.