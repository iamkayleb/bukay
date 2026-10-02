<!-- base-branch: eval/cursor -->
<!-- eval-round: 18 -->
<!-- eval-spec: embed-widget -->
<!-- eval-agent: cursor -->

## Why

Merchants with an existing site convert better booking in place than being sent elsewhere.

## Scope

Script tag and iframe widget the business embeds on its own site.

## Tasks

- [ ] Add `app/embed/[slug]/page.tsx`: build the iframe route
- [ ] Add `public/widget.js`: implement the loader with height messaging
- [ ] Add `docs/EMBED.md`: document the snippet
- [ ] Add `tests/embed.test.ts` including an accessibility pass

## Acceptance Criteria

- [ ] The widget renders on a plain HTML page, verified by `pnpm test`
- [ ] The accessibility pass in `tests/embed.test.ts` reports zero critical issues
- [ ] Iframe height tracks content height
- [ ] `pnpm test` passes
