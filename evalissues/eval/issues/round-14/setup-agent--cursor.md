<!-- base-branch: eval/cursor -->
<!-- eval-round: 14 -->
<!-- eval-spec: setup-agent -->
<!-- eval-agent: cursor -->

## Why

Self-serve onboarding is what lets the product scale without hand-holding each merchant.

## Scope

Chat surface extracting business type, location, hours, services, provider and deposit policy into a draft config.

## Tasks

- [ ] Add `lib/agent/setup-prompt.ts`: add the extraction prompt
- [ ] Add `app/start/page.tsx`: build the widget
- [ ] Add `lib/whatsapp/routing.ts`: route the WhatsApp entry point
- [ ] Add `prisma/schema.prisma`: add the `PendingTenant` model

## Acceptance Criteria

- [ ] A single descriptive message yields a complete draft, verified by `pnpm test`
- [ ] A missing field triggers a follow-up question
- [ ] A dropped session resumes from `PendingTenant`
- [ ] `pnpm test` passes
