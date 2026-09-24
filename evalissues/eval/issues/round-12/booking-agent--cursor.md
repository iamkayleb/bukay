<!-- base-branch: eval/cursor -->
<!-- eval-round: 12 -->
<!-- eval-spec: booking-agent -->
<!-- eval-agent: cursor -->

## Why

Conversational booking is the product's core differentiator.

## Scope

Tool-using agent that books a service over chat, with slot holds expiring in 15 minutes.

## Tasks

- [ ] Add `lib/agent/runtime.ts`: add the runtime and registry
- [ ] Add `lib/agent/tools/`: implement the five tools
- [ ] Add `lib/agent/prompt.ts`: add the prompt
- [ ] Add `tests/agent-booking.test.ts` covering the full path
- [ ] Add `prisma/schema.prisma`: persist transcripts via the `Message` model

## Acceptance Criteria

- [ ] The scripted conversation reaches a confirmed booking, verified by `pnpm test`
- [ ] A tool call for another tenant returns HTTP 403
- [ ] An unpaid hold releases after 15 minutes
- [ ] `pnpm test` passes
