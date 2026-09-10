<!-- base-branch: eval/cursor -->
<!-- eval-round: 12 -->
<!-- eval-spec: whatsapp-inbound -->
<!-- eval-agent: cursor -->

## Why

Two-way messaging is the precondition for the conversational booking agent.

## Scope

Receive inbound messages, route by business number to the tenant, and persist conversation history.

## Non-Goals

Nothing beyond the scope above. Do not modify files under `.github/`.

## Tasks

- [ ] Add `app/api/webhooks/whatsapp/route.ts`: implement
- [ ] Add `app/lib/whatsapp/routing.ts`: resolve the tenant by number
- [ ] Add `prisma/schema.prisma`: add `Conversation` and `Message` models
- [ ] Add `app/lib/whatsapp/templates.ts`: send the greeting template from  for unknown senders

## Acceptance Criteria

- [ ] An inbound message persists with the correct `tenantId`, verified by `pnpm test`
- [ ] An unknown number receives the greeting and returns HTTP 200
- [ ] A known client resumes without re-identification
- [ ] `pnpm test` passes

## Implementation Notes

Seeded for the `cursor` evaluation lane. Work on the branch cut for this issue and open the pull request against `eval/cursor`. Keep changes limited to the files named in Tasks. This repository puts application code under `app/` (for example `app/lib/`) and tests under `__tests__/`; follow the existing layout rather than creating a parallel tree.

<details>
<summary>Original Issue</summary>

```text
Seeded from eval/rounds/round-12.json, spec `whatsapp-inbound`, agent `cursor`.
```

</details>
