<!-- base-branch: eval/claude -->
<!-- eval-round: 15 -->
<!-- eval-spec: no-show-tracking -->
<!-- eval-agent: claude -->

## Why

No-show data is the input to risk scoring and deposit gating.

## Scope

Owner marks bookings as no-show from the dashboard or by replying to the WhatsApp notification.

## Non-Goals

Nothing beyond the scope above. Leave repository automation configuration untouched.

## Tasks

- [ ] Add `app/lib/booking-status.ts`: add the `no_show` transition
- [ ] Add `app/lib/whatsapp/routing.ts`: handle the reply shortcut
- [ ] Add `prisma/schema.prisma`: add no-show counters to the `Client` model
- [ ] Add `app/lib/audit.ts`: write an `AuditLog` row from

## Acceptance Criteria

- [ ] Both surfaces set status `no_show`, verified by `pnpm test`
- [ ] The counters on `Client` increment once per marking
- [ ] Marking a future booking returns HTTP 400
- [ ] `pnpm test` passes

## Implementation Notes

Seeded for the claude evaluation lane. Work on the branch cut for this issue and open the pull request against the claude lane branch. Keep changes limited to the files named in Tasks. Application code lives under the app directory and tests under the repository test directory; follow the existing layout rather than starting a parallel tree.

<details>
<summary>Original Issue</summary>

```text
Seeded from the round 15 specification, spec no-show-tracking, agent claude.
```

</details>
