<!-- base-branch: eval/cursor -->
<!-- eval-round: 14 -->
<!-- eval-spec: setup-agent -->
<!-- eval-agent: cursor -->

## Why

Self-serve onboarding is what lets the product scale without hand-holding each merchant.

## Scope

Chat surface extracting business type, location, hours, services, provider and deposit policy into a draft config.

## Non-Goals

Nothing beyond the scope above. Leave repository automation configuration untouched.

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

Seeded for the cursor evaluation lane. Work on the branch cut for this issue and open the pull request against the cursor lane branch. Keep changes limited to the files named in Tasks. Application code lives under the app directory and tests under the repository test directory; follow the existing layout rather than starting a parallel tree.

<details>
<summary>Original Issue</summary>

```text
Seeded from the round 14 specification, spec setup-agent, agent cursor.
```

</details>
