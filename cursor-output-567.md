## Keepalive round — issue #556

Verified locally:

- `pnpm build` — pass
- `pnpm vitest run` — 491 tests pass (77 files)

### Tasks (6/6)

- [x] **Calendar `day-view.tsx`** — `MerchantEmptyState` with `merchantEmptyMessages.calendarDay` and `Add a booking` → `#new-booking`
- [x] **Services `services-list.tsx`** — empty copy above `ServiceForm` on services page
- [x] **Clients** — empty copy via `ClientsList` on `clients/page.tsx`
- [x] **Payments `payments-list.tsx`** — `No payments yet.`
- [x] **Today `data.tsx`** — `No appointments yet.` linked to `/calendar`
- [x] **`empty-states.test.tsx`** — all five messages + demo tenant + grep guard

### Acceptance criteria (5/5)

- [x] Build and vitest
- [x] Empty-tenant messages covered by tests (mocked tenant / DayView jsdom)
- [x] Demo tenant tests assert no empty copy
- [x] Clients page empty copy tested
- [x] `Nothing here yet` absent under `app/`

### This round

Typed server-screen keys in `merchant-empty-copy.ts` and tightened the aggregate empty-tenant test.