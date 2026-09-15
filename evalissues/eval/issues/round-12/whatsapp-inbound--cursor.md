<!-- base-branch: eval/cursor -->
<!-- eval-round: 12 -->
<!-- eval-spec: whatsapp-inbound -->
<!-- eval-agent: cursor -->

## Why

Two-way messaging is the precondition for the conversational booking agent.

## Scope

Receive inbound messages, route by business number to the tenant, and persist conversation history.

## Tasks

- [ ] Add `app/api/webhooks/whatsapp/route.ts`: implement
- [ ] Add `lib/whatsapp/routing.ts`: resolve the tenant by number
- [ ] Add `prisma/schema.prisma`: add `Conversation` and `Message` models
- [ ] Add `lib/whatsapp/templates.ts`: send the greeting template from  for unknown senders

## Acceptance Criteria

- [ ] An inbound message persists with the correct `tenantId`, verified by `pnpm test`
- [ ] An unknown number receives the greeting and returns HTTP 200
- [ ] A known client resumes without re-identification
- [ ] `pnpm test` passes
