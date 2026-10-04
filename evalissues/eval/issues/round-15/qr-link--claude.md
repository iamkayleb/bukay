<!-- base-branch: eval/claude -->
<!-- eval-round: 15 -->
<!-- eval-spec: qr-link -->
<!-- eval-agent: claude -->

## Why

Merchants convert walk-in traffic by displaying a scannable link in the shop.

## Scope

Generate a branded booking URL and a downloadable QR image and PDF.

## Tasks

- [ ] Add `app/api/qr/[slug]/route.ts`: implement
- [ ] Add `lib/qr-pdf.ts`: build the branded PDF
- [ ] Add `app/(app)/settings/page.tsx`: add the download control

## Acceptance Criteria

- [ ] The generated code resolves to `/{slug}`, verified by `pnpm test`
- [ ] `app/api/qr/[slug]/route.ts` returns HTTP 200 with a PDF body
- [ ] The owner receives the file over WhatsApp after setup
- [ ] `pnpm test` passes
