## Round summary

Verified merchant empty states on `cursor/issue-556` (issue #556).

### Task verification

- **Calendar day view** — `DayView` shows `merchantEmptyMessages.calendarDay` and `#new-booking` link after load; covered by `__tests__/app/(app)/calendar/day-view.test.tsx` and `empty-states.test.tsx`.
- **Services, clients, payments, today** — `MerchantEmptyState` + centralized copy in `merchant-empty-copy.ts`; shell tests in `empty-states.test.tsx`.
- **E2E** — Added `e2e/merchant-empty-states.spec.ts` for fresh-tenant calendar and clients copy against a real DB.

### Commands

- `pnpm vitest run` — 501 passed
- `pnpm build` — succeeded
- `grep -rn "Nothing here yet" app/` — no matches