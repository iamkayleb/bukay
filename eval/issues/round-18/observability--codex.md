<!-- base-branch: eval/codex -->
<!-- eval-round: 18 -->
<!-- eval-spec: observability -->
<!-- eval-agent: codex -->

## Why

Agent and payment failures are invisible without tracing, and invisible failures erode trust.

## Scope

Structured logging, tracing across agent tool calls, dashboards and alerts with runbook links.

## Non-Goals

Nothing beyond the scope above. Do not modify files under `.github/`.

## Tasks

- [ ] Add `app/lib/logger.ts`: implement the logger emitting request and tenant ids
- [ ] Add `app/lib/agent/runtime.ts`: wrap tool calls with spans
- [ ] Add `ops/dashboards.json`: define dashboards
- [ ] Add `docs/runbooks/`: write runbooks

## Acceptance Criteria

- [ ] Every line from `app/lib/logger.ts` carries requestId and tenantId, verified by `pnpm test`
- [ ] An agent tool call emits a span
- [ ] A synthetic failure triggers an alert linking to `docs/runbooks/`
- [ ] `pnpm test` passes

## Implementation Notes

Seeded for the `codex` evaluation lane. Work on the branch cut for this issue and open the pull request against `eval/codex`. Keep changes limited to the files named in Tasks. This repository puts application code under `app/` (for example `app/lib/`) and tests under `__tests__/`; follow the existing layout rather than creating a parallel tree.

<details>
<summary>Original Issue</summary>

```text
Seeded from eval/rounds/round-18.json, spec `observability`, agent `codex`.
```

</details>
