<!-- base-branch: eval/cursor -->
<!-- eval-round: 14 -->
<!-- eval-spec: config-confirm -->
<!-- eval-agent: cursor -->

## Why

The owner must see and correct what the agent understood before a tenant is created.

## Scope

Preview the parsed config, accept natural-language edits, and create the tenant on confirmation.

## Tasks

- [ ] Add `components/ConfigPreview.tsx`: build the preview card
- [ ] Add `lib/agent/edit-config.ts`: implement the edit handler
- [ ] Add `lib/tenant-provision.ts`: implement tenant creation
- [ ] Add `lib/telemetry.ts`: record timings

## Acceptance Criteria

- [ ] The scripted round trip completes in under 5 minutes, verified by `pnpm test`
- [ ] A natural-language edit updates the draft in `PendingTenant`
- [ ] Confirmation creates tenant, services, hours and booking link
- [ ] `pnpm test` passes
