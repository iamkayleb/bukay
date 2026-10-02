<!-- base-branch: eval/cursor -->
<!-- eval-round: 13 -->
<!-- eval-spec: agent-guardrails -->
<!-- eval-agent: cursor -->

## Why

An agent with booking and payment tools on a public channel is an attack surface.

## Scope

Defences against prompt injection, cross-tenant calls, abuse and runaway usage, with human handoff.

**Allowed paths:**

- `__tests__/**`
- `app/lib/**`
- `app/lib/agent/**`
- `__tests__/**` and `tests/**` for the tests that prove the criteria
- `prisma/schema.prisma` and `prisma/migrations/**` when the work needs schema support
- `docs/**` for documentation the change makes stale
- `.agents/**`, `package.json`, `package-lock.json` and `pnpm-lock.yaml` as toolchain output

## Non-Goals

Do not change the booking flow itself. Tests must not require a live provider or a real phone number.

## Tasks

- [ ] Add `app/lib/agent/runtime.ts`: assert tenant scope before every tool call
- [ ] Add `app/lib/rate-limit.ts`: add per-number rate limiting
- [ ] Add `app/lib/agent/handoff.ts`: hand off to a human on repeated failure
- [ ] Add `__tests__/agent-redteam.test.ts`: cover cross-tenant access attempts

## Acceptance Criteria

- [ ] Every case in `__tests__/agent-redteam.test.ts` is blocked, verified by `pnpm test`
- [ ] A flooding sender receives HTTP 429
- [ ] The handoff command halts the agent and alerts the owner
- [ ] `pnpm test` passes

## Implementation Notes

Seeded for the cursor evaluation lane. Work on the branch cut for this issue and open the pull request against the cursor lane branch. Keep changes within the allowed paths listed under Scope; the acceptance verifier reports anything outside them as out of scope. Application code lives under the app directory and tests under the repository test directory; follow the existing layout rather than starting a parallel tree.

<details>
<summary>Original Issue</summary>

```text
Seeded from the round 13 specification, spec agent-guardrails, agent cursor.
```

</details>
