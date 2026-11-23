## Keepalive round — issue #556 (tasks 1–6 verified)

### Tasks
- [x] Calendar `day-view.tsx`: "No bookings on this date" + `#new-booking` link
- [x] Services: empty copy above create form (`services-list.tsx`)
- [x] Clients: empty copy on page (`clients-list.tsx` via `ClientsPage`)
- [x] Payments: "No payments yet" (`payments-list.tsx`)
- [x] Today: "No appointments yet" linked to `/calendar` (`today/data.tsx`)
- [x] `empty-states.test.tsx`: all five screens for empty tenant

### Acceptance criteria (verified this round)
- [x] `pnpm build` — pass
- [x] `pnpm vitest run` — 541 passed
- [x] `pnpm verify:issue-556:quick` — pass
- [x] `issue-556-real-db.test.tsx` — empty tenant (4 tests)
- [x] `grep -rn "Nothing here yet" app/` — no matches
- [x] Demo tenant — no empty copy when data present

### This round
Confirmed PR task 1 unchanged in `day-view.tsx`; added CI workflow guard so acceptance criteria 1 stays wired to `ci.yml` (build + test + merchant-empty step).