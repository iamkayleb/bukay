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

- [ ] Add `app/lib/whatsapp/provider.ts`: define the port
- [ ] Add `app/lib/whatsapp/meta.ts`: add the adapter and a fake in `app/lib/whatsapp/fake.ts`
- [ ] Add `app/lib/whatsapp/templates.ts`: add the template registry
- [ ] Add `docs/WHATSAPP_TEMPLATES.md`: document approval steps

## Acceptance Criteria

- [ ] A sandbox send returns HTTP 200 with a message id, verified by `pnpm test`
- [ ] Every template in `app/lib/whatsapp/templates.ts` is documented
- [ ] `app/lib/whatsapp/fake.ts` substitutes for the adapter in tests
- [ ] `pnpm test` passes

## Implementation Notes

Seeded for the `codex` evaluation lane. Work on the branch cut for this issue and open the pull request against `eval/codex`. Keep changes limited to the files named in Tasks. This repository puts application code under `app/` (for example `app/lib/`) and tests under `__tests__/`; follow the existing layout rather than creating a parallel tree.

<details>
<summary>Original Issue</summary>

```text
Seeded from eval/rounds/round-10.json, spec `whatsapp-port`, agent `codex`.
```

</details>
