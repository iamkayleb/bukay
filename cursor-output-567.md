## Keepalive round summary

Verified issue #556 merchant empty states on branch `cursor/issue-556`.

### Verification

- `pnpm test:issue-556:pr-task-1` — calendar day empty state (task 1)
- `pnpm verify:issue-556:quick` — merchant-empty bundle + legacy copy grep
- `pnpm build` — production build succeeded
- `pnpm vitest run` — 553 tests passed

### Implementation

| Screen | Message | Location |
|--------|---------|----------|
| Calendar day | No bookings on this date. + add link | `day-view.tsx` |
| Services | No services yet — … | `services-list.tsx` |
| Clients | No clients yet — … | `clients-list.tsx` via `clients/page.tsx` |
| Payments | No payments yet. | `payments-list.tsx` |
| Today | No appointments yet. + `/calendar` link | `today/data.tsx` |

### Commit

- Exposed `data-merchant-empty-headline` on calendar day empty region, wired to `merchantEmptyCalendarDayHeadline`.