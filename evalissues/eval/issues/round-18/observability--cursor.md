<!-- base-branch: eval/cursor -->
<!-- eval-round: 18 -->
<!-- eval-spec: observability -->
<!-- eval-agent: cursor -->

## Why

Agent and payment failures are invisible without tracing, and invisible failures erode trust.

## Scope

Structured logging, tracing across agent tool calls, dashboards and alerts with runbook links.

## Tasks

- [ ] Add `lib/logger.ts`: implement the logger emitting request and tenant ids
- [ ] Add `lib/agent/runtime.ts`: wrap tool calls with spans
- [ ] Add `ops/dashboards.json`: define dashboards
- [ ] Add `docs/runbooks/`: write runbooks

## Acceptance Criteria

- [ ] Every line from `lib/logger.ts` carries requestId and tenantId, verified by `pnpm test`
- [ ] An agent tool call emits a span
- [ ] A synthetic failure triggers an alert linking to `docs/runbooks/`
- [ ] `pnpm test` passes
