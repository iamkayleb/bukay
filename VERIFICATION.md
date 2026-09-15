# Verification notes

## LLM evaluation failure (PR #329)

Investigation of the provider-comparison report posted on 2026-09-15 found that
the OpenAI evaluator was invoked but its request failed with HTTP 429 and the
provider error code `credit_balance_exhausted`. The configured organization has
no remaining API credits. This is an external billing/credential-state issue,
not a failure in the booking code or this repository's evaluator integration.

Restoring available OpenAI API credit (or configuring an authorized evaluator
provider) is required before that lane can complete successfully. No source
change can safely bypass a provider quota failure; the evaluator correctly
reported the failure rather than returning a fabricated review.

The Anthropic evaluation completed. The remaining implementation concerns it
reported are tracked by the subsequent tasks in this issue.

## Artifact cleanup

Verified with `find` and `git ls-files` on 2026-09-15:

- `langsmith-fleet-worker-attempt.json` is absent from the worktree and index.
- `agents/codex-306.md` and `agents/codex-321.md` were removed.
- No session or agent artifact files introduced by this run remain.

## Booking transaction review

`POST /api/public/bookings` now runs hold acquisition, client upsert, and
`pending_payment` booking creation in a single Prisma interactive transaction.
The focused API test asserts that this transaction boundary is used and passed:

```text
corepack pnpm exec vitest run __tests__/public-booking.test.ts
2 passed
```

The repository-wide `tsc --noEmit` check remains blocked by pre-existing
unrelated missing imports in `app/[slug]/book/confirmed/page.tsx` and
`app/[slug]/book/page.tsx`.

## SlotHold unique-constraint semantics

The unique `SlotHold.slotKey` constraint is necessary to make a competing
insert deterministic across processes, but it is not sufficient by itself for
at-most-once booking semantics. A unique hold can expire or be released while
a related booking still exists, and it cannot atomically include the client and
booking writes. The interactive transaction makes the hold acquisition and
booking creation atomic; durable, full-lifecycle at-most-once behavior also
requires reconciliation of expired holds and their pending bookings, plus a
database constraint or lock that represents the active booking interval.
