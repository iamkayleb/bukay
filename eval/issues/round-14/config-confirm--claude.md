<!-- base-branch: eval/claude -->
<!-- eval-round: 14 -->
<!-- eval-spec: config-confirm -->
<!-- eval-agent: claude -->

## Why

The owner must see and correct what the agent understood before a tenant is created.

## Scope

Preview the parsed config, accept natural-language edits, and create the tenant on confirmation.

## Non-Goals

Nothing beyond the scope above. Do not modify files under `.github/`.

## Tasks

- [ ] Add `components/ConfigPreview.tsx`: build the preview card
- [ ] Add `app/lib/agent/edit-config.ts`: implement the edit handler
- [ ] Add `app/lib/tenant-provision.ts`: implement tenant creation
- [ ] Add `app/lib/telemetry.ts`: record timings

## Acceptance Criteria

- [ ] The scripted round trip completes in under 5 minutes, verified by `pnpm test`
- [ ] A natural-language edit updates the draft in `PendingTenant`
- [ ] Confirmation creates tenant, services, hours and booking link
- [ ] `pnpm test` passes

## Implementation Notes

Seeded for the `claude` evaluation lane. Work on the branch cut for this issue and open the pull request against `eval/claude`. Keep changes limited to the files named in Tasks. This repository puts application code under `app/` (for example `app/lib/`) and tests under `__tests__/`; follow the existing layout rather than creating a parallel tree.

<details>
<summary>Original Issue</summary>

```text
Seeded from eval/rounds/round-14.json, spec `config-confirm`, agent `claude`.
```

</details>
