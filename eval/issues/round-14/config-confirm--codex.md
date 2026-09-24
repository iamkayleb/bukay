<!-- base-branch: eval/codex -->
<!-- eval-round: 14 -->
<!-- eval-spec: config-confirm -->
<!-- eval-agent: codex -->

## Why

The owner must see and correct what the agent understood before a tenant is created.

## Scope

Preview the parsed config, accept natural-language edits, and create the tenant on confirmation.

**Allowed paths:**

- `app/lib/**`
- `app/lib/agent/**`
- `components/**`
- `__tests__/**` and `tests/**` for the tests that prove the criteria
- `prisma/schema.prisma` and `prisma/migrations/**` when the work needs schema support
- `docs/**` for documentation the change makes stale
- `.agents/**`, `package.json`, `package-lock.json` and `pnpm-lock.yaml` as toolchain output

## Non-Goals

Nothing beyond the scope above. Leave repository automation configuration untouched.

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

Seeded for the codex evaluation lane. Work on the branch cut for this issue and open the pull request against the codex lane branch. Keep changes within the allowed paths listed under Scope; the acceptance verifier reports anything outside them as out of scope. Application code lives under the app directory and tests under the repository test directory; follow the existing layout rather than starting a parallel tree.

<details>
<summary>Original Issue</summary>

```text
Seeded from the round 14 specification, spec config-confirm, agent codex.
```

</details>
