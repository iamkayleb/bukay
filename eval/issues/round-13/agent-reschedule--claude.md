<!-- base-branch: eval/claude -->
<!-- eval-round: 13 -->
<!-- eval-spec: agent-reschedule -->
<!-- eval-agent: claude -->

## Why

Most real conversations are changes to existing bookings, not new ones.

## Scope

Extend the agent with find, reschedule and cancel tools honouring the tenant cancellation policy.

## Non-Goals

Nothing beyond the scope above. Leave repository automation configuration untouched.

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

Seeded for the claude evaluation lane. Work on the branch cut for this issue and open the pull request against the claude lane branch. Keep changes limited to the files named in Tasks. Application code lives under the app directory and tests under the repository test directory; follow the existing layout rather than starting a parallel tree.

<details>
<summary>Original Issue</summary>

```text
Seeded from the round 13 specification, spec agent-reschedule, agent claude.
```

</details>
