<!-- base-branch: eval/codex -->
<!-- eval-round: 3 -->
<!-- eval-spec: dashboard-shell -->
<!-- eval-agent: codex -->

## Why

Owner-facing features need a consistent authenticated frame before they can be built independently.

## Scope

Create the authenticated layout at `/app` with sidebar, top bar and a mobile drawer.

## Non-Goals

Nothing beyond the scope above. Do not modify files under `.github/`.

## Tasks

- [ ] Add `app/(app)/layout.tsx`: create the route group layout with an auth guard
- [ ] Add `components/Sidebar.tsx`: build the sidebar with active-state styling
- [ ] Add `components/TopBar.tsx`: build the top bar with a user menu
- [ ] Add `components/MobileDrawer.tsx`: implement drawer behaviour
- [ ] Add `app/(app)/`: add empty-state placeholders
- [ ] Add `tests/nav.test.ts` covering desktop and mobile navigation

## Acceptance Criteria

- [ ] An unauthenticated request to `/app` returns HTTP 302 to `/login`
- [ ] Navigation works on desktop and mobile, verified by `pnpm test`
- [ ] Lighthouse mobile score is 90 or above
- [ ] `pnpm test` passes

## Implementation Notes

Seeded for the `codex` evaluation lane. Work on the branch cut for this issue and open the pull request against `eval/codex`. Keep changes limited to the files named in Tasks.

<details>
<summary>Original Issue</summary>

```text
Seeded from eval/rounds/round-03.json, spec `dashboard-shell`, agent `codex`.
```

</details>
