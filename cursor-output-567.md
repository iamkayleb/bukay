## Verification (2026-11-23)

Verified locally:

- `pnpm vitest run` — 499+ tests passed (including `empty-states.test.tsx`, `day-view.test.tsx`, `payments/page.test.tsx`)
- `pnpm build` — succeeded
- `grep -rn "Nothing here yet" app/` — no matches

### Tasks (6/6)

- [x] Calendar `day-view.tsx` — `MerchantEmptyState` with `merchantEmptyMessages.calendarDay` and `#new-booking` link
- [x] `services-list.tsx` — services empty copy; rendered above `ServiceForm` on services page
- [x] `clients/page.tsx` — clients empty copy via `ClientsList` above `ClientForm`
- [x] `payments-list.tsx` — `No payments yet.` empty state
- [x] `today/data.tsx` — `No appointments yet.` with link to `/calendar`
- [x] `__tests__/app/(app)/empty-states.test.tsx` — five-page empty tenant sweep

### Acceptance criteria (5/5)

- [x] `pnpm build` and `pnpm vitest run` pass
- [x] Empty tenant renders messages on all five screens (unit/render tests)
- [x] Demo tenant with data does not show empty copy (`populated tenant` tests)
- [x] Clients page shows post-booking guidance for empty tenant
- [x] No `Nothing here yet` under `app/`