<!-- base-branch: eval/codex -->
<!-- eval-round: 10 -->
<!-- eval-spec: whatsapp-port -->
<!-- eval-agent: codex -->

## Why

Every messaging feature depends on this port, and isolating it keeps the rest testable.

## Scope

WhatsAppProvider port with a Meta Cloud API adapter and a template catalog.

## Non-Goals

Template approval and a live business number are human prerequisites; tests must use the fake adapter.

## Tasks

- [ ] Add `lib/whatsapp/provider.ts`: define the port
- [ ] Add `lib/whatsapp/meta.ts`: add the adapter and a fake in `lib/whatsapp/fake.ts`
- [ ] Add `lib/whatsapp/templates.ts`: add the template registry
- [ ] Add `docs/WHATSAPP_TEMPLATES.md`: document approval steps

## Acceptance Criteria

- [ ] A sandbox send returns HTTP 200 with a message id, verified by `pnpm test`
- [ ] Every template in `lib/whatsapp/templates.ts` is documented
- [ ] `lib/whatsapp/fake.ts` substitutes for the adapter in tests
- [ ] `pnpm test` passes
