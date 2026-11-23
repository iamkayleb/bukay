# Keepalive round 567 — issue #556

## Completed this round

- **Task 1 (calendar `day-view.tsx`):** Verified empty day shows `merchantEmptyMessages.calendarDay` with `#new-booking` add link via `MerchantEmptyState`. Added `data-testid="calendar-day-empty"` on the day schedule region for stable tests.
- **Checks:** `pnpm vitest run __tests__/app/(app)/calendar/day-view.test.tsx` (5 passed); `pnpm vitest run __tests__/app/(app)/empty-states.test.tsx` (22 passed); `pnpm build` OK; `grep -rn "Nothing here yet" app/` empty.

## Next

- Task 2: services empty copy above create form (already implemented on branch — verify and check off next round).