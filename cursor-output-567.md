## Keepalive round — issue #556 (all PR tasks verified)

### Tasks 1–6
| Task | Status | Verification |
|------|--------|--------------|
| Calendar `day-view.tsx` empty day + add-booking link | Done | `day-view.tsx`, `day-view.test.tsx`, `issue-556-acceptance` PR task 1 |
| Services empty above create form | Done | `services-list.tsx`, `services/page.test.tsx` |
| Clients empty on page | Done | `clients-list.tsx` via `ClientsPage`, `clients/page.test.tsx` |
| Payments empty copy | Done | `payments-list.tsx`, `payments-list.test.tsx` |
| Today empty + `/calendar` link | Done | `today/data.tsx`, `today/page.test.tsx` |
| `empty-states.test.tsx` all five screens | Done | 22 tests |

### Acceptance criteria (local)
- `pnpm build` — pass
- `pnpm vitest run` — 540 passed
- `pnpm verify:issue-556:quick` — pass
- `issue-556-real-db.test.tsx` — empty tenant SQLite (4 tests)
- `grep -rn "Nothing here yet" app/` — no matches
- Demo tenant — no empty copy when data present (`empty-states.test.tsx` populated suite)

### This round
Added acceptance source-regression guard for PR task 1 (`day-view.tsx` wiring).