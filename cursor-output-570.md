## Keepalive run summary

Verified on `cursor/issue-553` (2026-11-28): clean `pnpm build`, full `pnpm vitest run` (509 tests), and `__tests__/app/(app)/today/summary.test.ts` (18 tests) against SQLite (`prisma migrate deploy`).

### Tasks

- [x] In `app/(app)/today/data.tsx`, add a function returning the count of today's bookings, the sum of `amountCents` for payments with status `paid` created today, and the count of today's bookings with no paid payment (`getTodaySummaryFigures` / `getTodaySummary` / `queryTodaySummaryFigures` / `computeTodaySummaryFigures`).
- [x] Use the existing `zonedDayRange` in `app/(app)/today/data.tsx` for the day boundary so the figures match the list below them.
- [x] Add `app/(app)/today/summary.tsx` rendering the three figures with labels.
- [x] Render it above the appointment list in `app/(app)/today/data.tsx` (`TodaySummaryPanel` in `TodaySchedule`).
- [x] Add `__tests__/app/(app)/today/summary.test.ts` covering a day with bookings and payments, an empty day, and the timezone boundary, against a real database.

### Acceptance criteria

- [x] `pnpm build` and `pnpm vitest run` pass with no new failures.
- [x] With a seeded database and a booking created for today, the summary function returns a count of 1 (`summary.test.ts` — real DB, `[AC-2]`).
- [x] On a day with no bookings the three figures read zero rather than the section being absent (`[AC-3]`).
- [x] A booking whose payment status is `pending` counts toward unpaid, not toward money taken (`[AC-4]` in summary + page tests).
- [x] A merchant signs in, adds a booking for today through `/calendar`, opens `/today`, and sees the booking count rise by one (`e2e/today.spec.ts`; DB increment in `summary.test.ts` `[AC-5]`).

**Progress:** 10/10 tasks complete, 0 remaining

### This run

- Added real-database `getTodaySummaryFigures` coverage for a fully paid same-day booking.
- Re-verified `pnpm build` (clean `.next`) and full `pnpm vitest run`.