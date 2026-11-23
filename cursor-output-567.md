## Run 567 — issue #556 empty states

Verified merchant empty-state copy and links for all scoped screens.

### Task verification

1. **Calendar day view** — `DayView` shows `MerchantEmptyState` with “No bookings on this date.” and `href="#new-booking"` (“Add a booking”) after load; loading guard covered in tests.
2. **Services** — empty message renders via `ServicesList` above `ServiceForm` on `ServicesPage`.
3. **Clients** — empty message on `ClientsPage` via `ClientsList`, above `ClientForm`.
4. **Payments** — `PaymentsList` shows “No payments yet.” on page and component tests.
5. **Today** — “No appointments yet.” with `Link` to `/calendar` and visible CTA copy.
6. **Tests** — `__tests__/app/(app)/empty-states.test.tsx` (18 cases) plus related service/today tests.

### Acceptance checks (local)

- `pnpm vitest run` — 490 passed
- `pnpm build` — succeeded
- `grep -rn "Nothing here yet" app/` — no matches

### Commands

```
pnpm vitest run __tests__/app/(app)/empty-states.test.tsx
pnpm vitest run
pnpm build
grep -rn "Nothing here yet" app/ || true
```