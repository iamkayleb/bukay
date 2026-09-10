<!-- base-branch: eval/codex -->
<!-- eval-round: 15 -->
<!-- eval-spec: no-show-tracking -->
<!-- eval-agent: codex -->

## Why

No-show data is the input to risk scoring and deposit gating.

## Scope

Owner marks bookings as no-show from the dashboard or by replying to the WhatsApp notification.

## Non-Goals

Nothing beyond the scope above. Do not modify files under `.github/`.

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

Seeded for the `codex` evaluation lane. Work on the branch cut for this issue and open the pull request against `eval/codex`. Keep changes limited to the files named in Tasks. This repository puts application code under `app/` (for example `app/lib/`) and tests under `__tests__/`; follow the existing layout rather than creating a parallel tree.

<details>
<summary>Original Issue</summary>

```text
Seeded from eval/rounds/round-15.json, spec `no-show-tracking`, agent `codex`.
```

</details>
