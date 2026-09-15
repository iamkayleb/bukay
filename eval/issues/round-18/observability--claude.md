<!-- base-branch: eval/claude -->
<!-- eval-round: 18 -->
<!-- eval-spec: observability -->
<!-- eval-agent: claude -->

## Why

Agent and payment failures are invisible without tracing, and invisible failures erode trust.

## Scope

Structured logging, tracing across agent tool calls, dashboards and alerts with runbook links.

## Non-Goals

Nothing beyond the scope above. Leave repository automation configuration untouched.

## Tasks

- [ ] Add `app/lib/logger.ts`: emit a request id on every line
- [ ] Add `app/lib/logger.ts`: emit a tenant id on every line
- [ ] Add `app/lib/agent/runtime.ts`: wrap tool calls with spans
- [ ] Add `ops/dashboards.json`: define dashboards
- [ ] Add `docs/runbooks/`: write runbooks

## Acceptance Criteria

- [ ] Every line from `app/lib/logger.ts` carries requestId and tenantId, verified by `pnpm test`
- [ ] An agent tool call emits a span
- [ ] A synthetic failure triggers an alert linking to `docs/runbooks/`
- [ ] `pnpm test` passes

## Implementation Notes

Seeded for the claude evaluation lane. Work on the branch cut for this issue and open the pull request against the claude lane branch. Keep changes limited to the files named in Tasks. Application code lives under the app directory and tests under the repository test directory; follow the existing layout rather than starting a parallel tree.

<details>
<summary>Original Issue</summary>

```text
Seeded from the round 18 specification, spec observability, agent claude.
```

</details>
