<!-- base-branch: eval/codex -->
<!-- eval-round: 12 -->
<!-- eval-spec: booking-agent -->
<!-- eval-agent: codex -->

## Why

Conversational booking is the product's core differentiator.

## Scope

Tool-using agent that books a service over chat, with slot holds expiring in 15 minutes.

## Non-Goals

Nothing beyond the scope above. Leave repository automation configuration untouched.

## Tasks

- [ ] Add `app/lib/agent/runtime.ts`: add the agent runtime
- [ ] Add `app/lib/agent/runtime.ts`: add the tool registry
- [ ] Add `app/lib/agent/tools/`: implement the five tools
- [ ] Add `app/lib/agent/prompt.ts`: add the prompt
- [ ] Add `__tests__/agent-booking.test.ts` covering the full path
- [ ] Add `prisma/schema.prisma`: persist transcripts via the `Message` model

## Acceptance Criteria

- [ ] The scripted conversation reaches a confirmed booking, verified by `pnpm test`
- [ ] A tool call for another tenant returns HTTP 403
- [ ] An unpaid hold releases after 15 minutes
- [ ] `pnpm test` passes

## Implementation Notes

Seeded for the codex evaluation lane. Work on the branch cut for this issue and open the pull request against the codex lane branch. Keep changes limited to the files named in Tasks. Application code lives under the app directory and tests under the repository test directory; follow the existing layout rather than starting a parallel tree.

<details>
<summary>Original Issue</summary>

```text
Seeded from the round 12 specification, spec booking-agent, agent codex.
```

</details>
