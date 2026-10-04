<!-- base-branch: eval/claude -->
<!-- eval-round: 10 -->
<!-- eval-spec: whatsapp-port -->
<!-- eval-agent: claude -->

## Why

Every messaging feature depends on this port, and isolating it keeps the rest testable.

## Scope

WhatsAppProvider port with a Meta Cloud API adapter and a template catalog.

**Allowed paths:**

- `app/lib/whatsapp/**`
- `docs/**`
- `__tests__/**` and `tests/**` for the tests that prove the criteria
- `prisma/schema.prisma` and `prisma/migrations/**` when the work needs schema support
- `docs/**` for documentation the change makes stale
- `.agents/**`, `package.json`, `package-lock.json` and `pnpm-lock.yaml` as toolchain output

## Non-Goals

Template approval and a live business number are human prerequisites; tests must use the fake adapter.

## Tasks

- [ ] Add `app/lib/whatsapp/provider.ts`: define the port
- [ ] Add `app/lib/whatsapp/meta.ts`: implement the live adapter
- [ ] Add `app/lib/whatsapp/fake.ts`: implement the test double
- [ ] Add `app/lib/whatsapp/templates.ts`: add the template registry
- [ ] Add `docs/WHATSAPP_TEMPLATES.md`: document approval steps

## Acceptance Criteria

- [ ] A sandbox send returns HTTP 200 with a message id, verified by `pnpm test`
- [ ] Every template in `app/lib/whatsapp/templates.ts` is documented
- [ ] `app/lib/whatsapp/fake.ts` substitutes for the adapter in tests
- [ ] `pnpm test` passes

## Implementation Notes

Seeded for the claude evaluation lane. Work on the branch cut for this issue and open the pull request against the claude lane branch. Keep changes within the allowed paths listed under Scope; the acceptance verifier reports anything outside them as out of scope. Application code lives under the app directory and tests under the repository test directory; follow the existing layout rather than starting a parallel tree.

<details>
<summary>Original Issue</summary>

```text
Seeded from the round 10 specification, spec whatsapp-port, agent claude.
```

</details>
