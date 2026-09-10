<!-- base-branch: eval/codex -->
<!-- eval-round: 13 -->
<!-- eval-spec: agent-guardrails -->
<!-- eval-agent: codex -->

## Why

An agent with booking and payment tools on a public channel is an attack surface.

## Scope

Defences against prompt injection, cross-tenant calls, abuse and runaway usage, with human handoff.

## Non-Goals

Nothing beyond the scope above. Do not modify files under `.github/`.

## Tasks

- [ ] Add `app/lib/agent/prompt.ts`: harden the system prompt
- [ ] Add `app/lib/agent/runtime.ts`: assert tenant scope before every tool call
- [ ] Add `app/lib/rate-limit.ts`: add per-number rate limiting
- [ ] Add `app/lib/agent/filters.ts`: add the abuse filter
- [ ] Add `app/lib/agent/handoff.ts`: implement handoff
- [ ] Add `__tests__/agent-redteam.test.ts`

## Acceptance Criteria

- [ ] Every case in `__tests__/agent-redteam.test.ts` is blocked, verified by `pnpm test`
- [ ] A flooding sender receives HTTP 429
- [ ] The handoff command halts the agent and alerts the owner
- [ ] `pnpm test` passes

## Implementation Notes

Seeded for the `codex` evaluation lane. Work on the branch cut for this issue and open the pull request against `eval/codex`. Keep changes limited to the files named in Tasks. This repository puts application code under `app/` (for example `app/lib/`) and tests under `__tests__/`; follow the existing layout rather than creating a parallel tree.

<details>
<summary>Original Issue</summary>

```text
Seeded from eval/rounds/round-13.json, spec `agent-guardrails`, agent `codex`.
```

</details>
