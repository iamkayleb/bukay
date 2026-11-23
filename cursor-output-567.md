## Keepalive round — issue #556 (calendar day-view / full PR)

### Task 1 (day-view empty date)
- **Implementation:** `DayView` uses `MerchantEmptyState` with `merchantEmptyMessages.calendarDay` (`"No bookings on this date."`) and an action link to `#new-booking` (`merchantEmptyHrefs.calendarAddBooking`).
- **Verification:** `pnpm vitest run __tests__/app/(app)/calendar/day-view.test.tsx` — 10/10 passed; `issue-556-acceptance.test.ts` PR task 1 case passed; `issue-556-real-db.test.tsx` calendar assertions passed.

### All PR tasks (6)
Verified via `pnpm test:merchant-empty-states` and `empty-states.test.tsx` (22 tests).

### Acceptance criteria (5)
| Criterion | Result |
|-----------|--------|
| `pnpm build` + `pnpm vitest run` | build OK; 539 tests passed |
| Real SQLite empty tenant | `issue-556-real-db.test.tsx` — 4/4 passed |
| Demo tenant has no empty copy | `issue-556-acceptance` + mocked data tests |
| Fresh merchant `/clients` guidance | `e2e/merchant-empty-states.spec.ts` |
| No `Nothing here yet` under `app/` | `grep` empty |

### This commit
Tighten Playwright calendar e2e to match `day-view` `aria-label` on the add-booking link.

### Commands run
```bash
pnpm vitest run __tests__/app/(app)/calendar/day-view.test.tsx
pnpm vitest run __tests__/app/(app)/issue-556-acceptance.test.ts __tests__/app/(app)/issue-556-real-db.test.tsx
pnpm vitest run   # 539 passed
pnpm build
bash -c '! grep -rn "Nothing here yet" app/'
```