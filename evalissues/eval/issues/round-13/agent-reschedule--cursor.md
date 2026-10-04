<!-- base-branch: eval/cursor -->
<!-- eval-round: 13 -->
<!-- eval-spec: agent-reschedule -->
<!-- eval-agent: cursor -->

## Why

Most real conversations are changes to existing bookings, not new ones.

## Scope

Extend the agent with find, reschedule and cancel tools honouring the tenant cancellation policy.

## Tasks

- [ ] Add `lib/agent/tools/`: add the three tools
- [ ] Add `lib/policy.ts`: implement the policy evaluator
- [ ] Add `lib/agent/prompt.ts`: add disambiguation flows
- [ ] Add `tests/agent-reschedule.test.ts`

## Acceptance Criteria

- [ ] Cancelling inside the policy window issues a refund, verified by `pnpm test`
- [ ] Cancelling outside the window retains the deposit per `lib/policy.ts`
- [ ] Rescheduling updates the booking and notifies the owner
- [ ] `pnpm test` passes
