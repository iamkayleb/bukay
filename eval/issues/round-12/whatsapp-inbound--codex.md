<!-- base-branch: eval/codex -->
<!-- eval-round: 12 -->
<!-- eval-spec: whatsapp-inbound -->
<!-- eval-agent: codex -->

## Why

Two-way messaging is the precondition for the conversational booking agent.

## Scope

Receive inbound messages, route by business number to the tenant, and persist conversation history.

## Non-Goals

Nothing beyond the scope above. Leave repository automation configuration untouched.

## Tasks

- [ ] Add `app/api/webhooks/whatsapp/route.ts`: implement
- [ ] Add `app/lib/whatsapp/routing.ts`: resolve the tenant by number
- [ ] Add `prisma/schema.prisma`: add the `Conversation` model
- [ ] Add `prisma/schema.prisma`: add the `Message` model
- [ ] Add `app/lib/whatsapp/templates.ts`: send the greeting template from  for unknown senders

## Acceptance Criteria

- [ ] An inbound message persists with the correct `tenantId`, verified by `pnpm test`
- [ ] An unknown number receives the greeting and returns HTTP 200
- [ ] A known client resumes without re-identification
- [ ] `pnpm test` passes

## Implementation Notes

Seeded for the codex evaluation lane. Work on the branch cut for this issue and open the pull request against the codex lane branch. Keep changes limited to the files named in Tasks. Application code lives under the app directory and tests under the repository test directory; follow the existing layout rather than starting a parallel tree.

<details>
<summary>Original Issue</summary>

```text
Seeded from the round 12 specification, spec whatsapp-inbound, agent codex.
```

</details>
