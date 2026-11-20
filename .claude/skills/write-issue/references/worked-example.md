# A worked example

Written with this skill and checked with the real validator:

```
$ python .github/scripts/issue_format.py /tmp/issue-body.md
Issue body is agent-processable with advisories.

_Advisory:_
- 3 cited path(s) do not exist yet: ... — expected when a task creates them
```

Note what makes it pass rather than merely look complete:

- every task names a path, and the four that already exist were verified
- every criterion names a command, a test file, or a tagged spec
- the three `[AC-n]` criteria are the ones about what a person sees
- amounts, empty state and tokens come from the presentation bar — written as
  criteria, not as adjectives
- `## Non-Goals` forbids the scaffold-only reading of "done"

---

## Why

`/clients` lists clients but a merchant cannot see what any one of them is
worth. `app/(app)/clients/clients-list.tsx` renders name and phone only, and
`app/api/clients/[id]/route.ts:31` already returns the client's bookings —
the data is fetched and thrown away. A merchant deciding whether to chase a
no-show has nothing to look at.

## Scope

The client detail panel at `/clients/[id]`: bookings to date, money taken,
money owed. Read-only.

## Non-Goals

- No editing of a client's bookings or payments from this screen.
- No export, no filtering, no date range. One client, current totals.
- Not a replacement for `/payments`; this is per-client, not per-transaction.

## Tasks

- [ ] Add `app/(app)/clients/client-summary.tsx` rendering total bookings,
      amount paid and amount outstanding for one client.
- [ ] Extend `app/api/clients/[id]/route.ts` to return `totalBookings`,
      `paidKobo` and `outstandingKobo`, derived from the client's bookings and
      their payments.
- [ ] Render `client-summary.tsx` in `app/(app)/clients/[id]/page.tsx` above
      the existing booking list.
- [ ] Add `__tests__/app/api/clients/summary.test.ts` covering a client with
      paid, pending and no bookings.
- [ ] Add `e2e/clients.spec.ts` asserting the summary on the seeded demo
      client.

## Acceptance Criteria

- [ ] `pnpm vitest run __tests__/app/api/clients/summary.test.ts` passes,
      including a client with zero bookings returning zeroes rather than null.
- [ ] [AC-1] On `/clients/[id]` for the seeded demo client, total bookings,
      amount paid and amount outstanding are all visible — asserted in
      `e2e/clients.spec.ts`.
- [ ] [AC-2] Amounts render as `₦#,###` right-aligned, and a 500000-kobo
      payment shows `₦5,000` — asserted in `e2e/clients.spec.ts`.
- [ ] [AC-3] A client with no bookings shows the empty state with a visible
      action, not a blank panel — asserted in `e2e/clients.spec.ts`.
- [ ] `pnpm build` and `pnpm exec tsc --noEmit` both pass.

## Implementation Notes

- Amounts are stored in kobo. Format through the existing helper used by
  `app/(app)/payments/payments-list.tsx`; do not reimplement it.
- Use design-system tokens only: `bg-surface`, `border-default`,
  `rounded-card`, `text-muted`, `text-pos` for paid, `text-neg` for
  outstanding. No `slate-*`, no hex values.
- Follow the thin-default-export pattern in `app/(app)/today/data.tsx`.
