<!-- base-branch: eval/claude -->
<!-- eval-round: 15 -->
<!-- eval-spec: no-show-tracking -->
<!-- eval-agent: claude -->

## Why

No-show data is the input to risk scoring and deposit gating.

## Scope

Owner marks bookings as no-show from the dashboard or by replying to the WhatsApp notification.

**Allowed paths:**

- `app/lib/**`
- `app/lib/whatsapp/**`
- `prisma/**`
- `__tests__/**` and `tests/**` for the tests that prove the criteria
- `prisma/schema.prisma` and `prisma/migrations/**` when the work needs schema support
- `docs/**` for documentation the change makes stale
- `.agents/**`, `package.json`, `package-lock.json` and `pnpm-lock.yaml` as toolchain output

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

Seeded for the claude evaluation lane. Work on the branch cut for this issue and open the pull request against the claude lane branch. Keep changes within the allowed paths listed under Scope; the acceptance verifier reports anything outside them as out of scope. Application code lives under the app directory and tests under the repository test directory; follow the existing layout rather than starting a parallel tree.

<details>
<summary>Original Issue</summary>

```text
Seeded from the round 15 specification, spec no-show-tracking, agent claude.
```

</details>
