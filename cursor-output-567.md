# Keepalive round 567 — issue #556 merchant empty states

## Verification (2026-11-23)

| Check | Result |
|-------|--------|
| `pnpm vitest run` | 518 tests passed |
| `pnpm build` | Success |
| `grep -rn "Nothing here yet" app/` | No matches |
| Calendar `DayView` empty day | `merchantEmptyMessages.calendarDay` + `#new-booking` link via `data-testid="calendar-add-booking-link"` |

## Tasks

- [x] Calendar day-view empty copy and add-booking link
- [x] Services list empty copy (page layout keeps it above create form)
- [x] Clients page empty copy (via `ClientsList`)
- [x] Payments list empty copy
- [x] Today schedule empty copy linked to `/calendar`
- [x] `__tests__/app/(app)/empty-states.test.tsx` coverage

## Acceptance criteria

- [x] Build and unit tests pass locally
- [x] Unit/integration tests render each empty message for empty tenant mocks
- [x] Populated-tenant tests assert demo copy is hidden
- [x] Clients empty message covered on page shell tests
- [x] Legacy `Nothing here yet` removed from `app/`

E2E (`e2e/merchant-empty-states.spec.ts`) exercises fresh sign-in and seeded demo owner when Playwright + DB are available.