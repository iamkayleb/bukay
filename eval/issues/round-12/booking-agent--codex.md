<!-- base-branch: eval/codex -->
<!-- eval-round: 12 -->
<!-- eval-spec: booking-agent -->
<!-- eval-agent: codex -->

## Why

Conversational booking is the product's core differentiator.

## Scope

Tool-using agent that books a service over chat, with slot holds expiring in 15 minutes.

**Allowed paths:**

- `__tests__/**`
- `app/lib/agent/**`
- `app/lib/agent/tools/**`
- `__tests__/**` and `tests/**` for the tests that prove the criteria
- `prisma/schema.prisma` and `prisma/migrations/**` when the work needs schema support
- `docs/**` for documentation the change makes stale
- `.agents/**`, `package.json`, `package-lock.json` and `pnpm-lock.yaml` as toolchain output

## Non-Goals

Reschedule and cancel are out of scope. Use the fake provider in tests; no live WhatsApp number is required.

## Tasks

- [ ] Add `app/lib/agent/runtime.ts`: add the agent runtime with a tool registry
- [ ] Add `app/lib/agent/tools/availability.ts`: expose the availability lookup tool
- [ ] Add `app/lib/agent/tools/book.ts`: expose the create-booking tool
- [ ] Add `app/lib/agent/prompt.ts`: add the system prompt
- [ ] Add `__tests__/agent-booking.test.ts`: cover the happy path end to end

## Acceptance Criteria

- [ ] The scripted conversation reaches a confirmed booking, verified by `pnpm test`
- [ ] A tool call for another tenant returns HTTP 403
- [ ] An unpaid hold releases after 15 minutes
- [ ] `pnpm test` passes

## Implementation Notes

Seeded for the codex evaluation lane. Work on the branch cut for this issue and open the pull request against the codex lane branch. Keep changes within the allowed paths listed under Scope; the acceptance verifier reports anything outside them as out of scope. Application code lives under the app directory and tests under the repository test directory; follow the existing layout rather than starting a parallel tree.

<details>
<summary>Original Issue</summary>

```text
Seeded from the round 12 specification, spec booking-agent, agent codex.
```

</details>
