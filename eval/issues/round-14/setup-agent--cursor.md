<!-- base-branch: eval/cursor -->
<!-- eval-round: 14 -->
<!-- eval-spec: setup-agent -->
<!-- eval-agent: cursor -->

## Why

Self-serve onboarding is what lets the product scale without hand-holding each merchant.

## Scope

Chat surface extracting business type, location, hours, services, provider and deposit policy into a draft config.

## Non-Goals

Nothing beyond the scope above. Do not modify files under `.github/`.

## Tasks

- [ ] Add `app/lib/agent/setup-prompt.ts`: add the extraction prompt
- [ ] Add `app/start/page.tsx`: build the widget
- [ ] Add `app/lib/whatsapp/routing.ts`: route the WhatsApp entry point
- [ ] Add `prisma/schema.prisma`: add the `PendingTenant` model

## Acceptance Criteria

- [ ] A single descriptive message yields a complete draft, verified by `pnpm test`
- [ ] A missing field triggers a follow-up question
- [ ] A dropped session resumes from `PendingTenant`
- [ ] `pnpm test` passes

## Implementation Notes

Seeded for the `cursor` evaluation lane. Work on the branch cut for this issue and open the pull request against `eval/cursor`. Keep changes limited to the files named in Tasks. This repository puts application code under `app/` (for example `app/lib/`) and tests under `__tests__/`; follow the existing layout rather than creating a parallel tree.

<details>
<summary>Original Issue</summary>

```text
Seeded from eval/rounds/round-14.json, spec `setup-agent`, agent `cursor`.
```

</details>
