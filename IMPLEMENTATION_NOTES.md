# Implementation Notes

## LLM evaluation for PR #329

The OpenAI evaluation did not run because its API request was rejected with HTTP
429 `credit_balance_exhausted`: the organization has no remaining API credits.
The Anthropic evaluation completed, so repository configuration and evaluation
routing were reached successfully.

This cannot be corrected by a repository change. A billing administrator must
add OpenAI API credits (or configure an approved evaluator account) before the
OpenAI evaluation can be retried. No secrets, workflow, or prompt changes are
required or appropriate for this failure.

Verification after that external action: re-run the PR evaluation and confirm
the OpenAI provider report contains a verdict rather than an invocation error.

## Slot-hold at-most-once semantics

`SlotHold.slotKey` has a database unique constraint. Concurrent creates for the
same slot therefore yield one successful write and Prisma error `P2002` for the
other request; this is sufficient to prevent concurrent active holds. The
booking route now performs that hold operation, client upsert, and booking
creation in one transaction, so a later write failure rolls the hold back too.

The constraint alone does not express booking lifecycle policy. Expiry cleanup
and the transaction are still required so an expired or failed hold does not
continue to make a slot unavailable.
