<!-- base-branch: eval/claude -->
<!-- eval-round: 15 -->
<!-- eval-spec: qr-link -->
<!-- eval-agent: claude -->

## Why

Merchants convert walk-in traffic by displaying a scannable link in the shop.

## Scope

Generate a branded booking URL and a downloadable QR image and PDF.

## Non-Goals

Nothing beyond the scope above. Leave repository automation configuration untouched.

## Tasks

- [ ] Add `app/api/qr/[slug]/route.ts`: implement
- [ ] Add `app/lib/qr-pdf.ts`: build the branded PDF
- [ ] Add `app/(app)/settings/page.tsx`: add the download control

## Acceptance Criteria

- [ ] The generated code resolves to `/{slug}`, verified by `pnpm test`
- [ ] `app/api/qr/[slug]/route.ts` returns HTTP 200 with a PDF body
- [ ] The owner receives the file over WhatsApp after setup
- [ ] `pnpm test` passes

## Implementation Notes

Seeded for the claude evaluation lane. Work on the branch cut for this issue and open the pull request against the claude lane branch. Keep changes limited to the files named in Tasks. Application code lives under the app directory and tests under the repository test directory; follow the existing layout rather than starting a parallel tree.

<details>
<summary>Original Issue</summary>

```text
Seeded from the round 15 specification, spec qr-link, agent claude.
```

</details>
