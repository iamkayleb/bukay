<!-- base-branch: eval/claude -->
<!-- eval-round: 13 -->
<!-- eval-spec: agent-guardrails -->
<!-- eval-agent: claude -->

## Why

An agent with booking and payment tools on a public channel is an attack surface.

## Scope

Defences against prompt injection, cross-tenant calls, abuse and runaway usage, with human handoff.

## Tasks

- [ ] Add `lib/agent/prompt.ts`: harden the system prompt
- [ ] Add `lib/agent/runtime.ts`: assert tenant scope before every tool call
- [ ] Add `lib/rate-limit.ts`: add per-number rate limiting
- [ ] Add `lib/agent/filters.ts`: add the abuse filter
- [ ] Add `lib/agent/handoff.ts`: implement handoff
- [ ] Add `tests/agent-redteam.test.ts`

## Acceptance Criteria

- [ ] Every case in `tests/agent-redteam.test.ts` is blocked, verified by `pnpm test`
- [ ] A flooding sender receives HTTP 429
- [ ] The handoff command halts the agent and alerts the owner
- [ ] `pnpm test` passes
