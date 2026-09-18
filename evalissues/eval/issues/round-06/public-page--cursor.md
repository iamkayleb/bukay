<!-- base-branch: eval/cursor -->
<!-- eval-round: 6 -->
<!-- eval-spec: public-page -->
<!-- eval-agent: cursor -->

## Why

This is the merchant's shareable shopfront and the entry point for every public booking.

## Scope

SSR route at `/{slug}` rendering a branded landing page with services, hours and a booking CTA.

## Tasks

- [ ] Add `app/[slug]/page.tsx`: build the SSR route
- [ ] Add `app/[slug]/page.tsx`: return `notFound()` for missing or inactive tenants
- [ ] Add `app/[slug]/head.tsx`: add SEO and Open Graph tags
- [ ] Set stale-while-revalidate headers in `next.config.js`

## Acceptance Criteria

- [ ] A valid slug responds with HTTP 200 under 500ms TTFB
- [ ] An unknown slug returns HTTP 404
- [ ] Lighthouse SEO score is 95 or above
- [ ] `pnpm test` passes
