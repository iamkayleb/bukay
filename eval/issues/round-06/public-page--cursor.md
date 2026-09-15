<!-- base-branch: eval/cursor -->
<!-- eval-round: 6 -->
<!-- eval-spec: public-page -->
<!-- eval-agent: cursor -->

## Why

This is the merchant's shareable shopfront and the entry point for every public booking.

## Scope

SSR route at `/{slug}` rendering a branded landing page with services, hours and a booking CTA.

## Non-Goals

Nothing beyond the scope above. Leave repository automation configuration untouched.

## Tasks

- [ ] Add `app/[slug]/page.tsx`: build the SSR route
- [ ] Add `app/[slug]/page.tsx`: return `notFound()` for missing or inactive tenants
- [ ] Add `app/[slug]/head.tsx`: add the SEO meta tags
- [ ] Add `app/[slug]/head.tsx`: add the Open Graph tags
- [ ] Set stale-while-revalidate headers in `next.config.js`

## Acceptance Criteria

- [ ] A valid slug responds with HTTP 200 under 500ms TTFB
- [ ] An unknown slug returns HTTP 404
- [ ] Lighthouse SEO score is 95 or above
- [ ] `pnpm test` passes

## Implementation Notes

Seeded for the cursor evaluation lane. Work on the branch cut for this issue and open the pull request against the cursor lane branch. Keep changes limited to the files named in Tasks. Application code lives under the app directory and tests under the repository test directory; follow the existing layout rather than starting a parallel tree.

<details>
<summary>Original Issue</summary>

```text
Seeded from the round 6 specification, spec public-page, agent cursor.
```

</details>
