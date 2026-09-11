<!-- base-branch: eval/cursor -->
<!-- eval-round: 18 -->
<!-- eval-spec: embed-widget -->
<!-- eval-agent: cursor -->

## Why

Merchants with an existing site convert better booking in place than being sent elsewhere.

## Scope

Script tag and iframe widget the business embeds on its own site.

## Non-Goals

Nothing beyond the scope above. Leave repository automation configuration untouched.

## Tasks

- [ ] Add `app/embed/[slug]/page.tsx`: build the iframe route
- [ ] Add `public/widget.js`: implement the loader with height messaging
- [ ] Add `docs/EMBED.md`: document the snippet
- [ ] Add `__tests__/embed.test.ts` including an accessibility pass

## Acceptance Criteria

- [ ] The widget renders on a plain HTML page, verified by `pnpm test`
- [ ] The accessibility pass in `__tests__/embed.test.ts` reports zero critical issues
- [ ] Iframe height tracks content height
- [ ] `pnpm test` passes

## Implementation Notes

Seeded for the cursor evaluation lane. Work on the branch cut for this issue and open the pull request against the cursor lane branch. Keep changes limited to the files named in Tasks. Application code lives under the app directory and tests under the repository test directory; follow the existing layout rather than starting a parallel tree.

<details>
<summary>Original Issue</summary>

```text
Seeded from the round 18 specification, spec embed-widget, agent cursor.
```

</details>
