<!-- base-branch: eval/codex -->
<!-- eval-round: 15 -->
<!-- eval-spec: qr-link -->
<!-- eval-agent: codex -->

## Why

Merchants convert walk-in traffic by displaying a scannable link in the shop.

## Scope

Generate a branded booking URL and a downloadable QR image and PDF.

## Non-Goals

Nothing beyond the scope above. Do not modify files under `.github/`.

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

Seeded for the `codex` evaluation lane. Work on the branch cut for this issue and open the pull request against `eval/codex`. Keep changes limited to the files named in Tasks. This repository puts application code under `app/` (for example `app/lib/`) and tests under `__tests__/`; follow the existing layout rather than creating a parallel tree.

<details>
<summary>Original Issue</summary>

```text
Seeded from eval/rounds/round-15.json, spec `qr-link`, agent `codex`.
```

</details>
