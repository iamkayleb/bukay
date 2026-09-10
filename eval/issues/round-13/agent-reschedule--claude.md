<!-- base-branch: eval/claude -->
<!-- eval-round: 13 -->
<!-- eval-spec: agent-reschedule -->
<!-- eval-agent: claude -->

## Why

Most real conversations are changes to existing bookings, not new ones.

## Scope

Extend the agent with find, reschedule and cancel tools honouring the tenant cancellation policy.

## Non-Goals

Nothing beyond the scope above. Do not modify files under `.github/`.

## Tasks

- [ ] Add `app/lib/agent/tools/`: add the three tools
- [ ] Add `app/lib/policy.ts`: implement the policy evaluator
- [ ] Add `app/lib/agent/prompt.ts`: add disambiguation flows
- [ ] Add `__tests__/agent-reschedule.test.ts`

## Acceptance Criteria

- [ ] Cancelling inside the policy window issues a refund, verified by `pnpm test`
- [ ] Cancelling outside the window retains the deposit per `app/lib/policy.ts`
- [ ] Rescheduling updates the booking and notifies the owner
- [ ] `pnpm test` passes

## Implementation Notes

Seeded for the `claude` evaluation lane. Work on the branch cut for this issue and open the pull request against `eval/claude`. Keep changes limited to the files named in Tasks. This repository puts application code under `app/` (for example `app/lib/`) and tests under `__tests__/`; follow the existing layout rather than creating a parallel tree.

<details>
<summary>Original Issue</summary>

```text
Seeded from eval/rounds/round-13.json, spec `agent-reschedule`, agent `claude`.
```

</details>
