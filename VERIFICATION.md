# Verification notes — follow-up #387 (PR #386 CONCERNS)

This file maps each verification concern from [PR #386](https://github.com/iamkayleb/bukay/pull/386) to a test, code fix, or documented explanation.

## Concern: `pnpm-lock.yaml` not visible in the PR #386 diff

**Status:** addressed (verified + gated)

PR #386 deleted `package-lock.json` and relied on an existing `pnpm-lock.yaml` on the base branch. The lockfile was intentionally not part of that PR’s diff, so reviewers could not confirm presence from the patch alone.

**Base-branch verification (2026-09-22):**

```text
$ git fetch origin eval/cursor
$ git cat-file -e origin/eval/cursor:pnpm-lock.yaml && echo EXISTS
EXISTS
$ git rev-parse origin/eval/cursor:pnpm-lock.yaml
01347dac0242ce973ea96378e136461a333b6dde
$ git log -1 --oneline origin/eval/cursor -- pnpm-lock.yaml
d9c53e8 fix: align pnpm lockfile after conflict resolution
```

`pnpm-lock.yaml` is therefore present and git-tracked on `eval/cursor`. Installs must use this lockfile (`packageManager: pnpm@…` + `pnpm install --frozen-lockfile`).

**Regression gates:**

- CI step `Assert pnpm lockfile (no npm package-lock)` runs **before** install and tests
- `__tests__/app/api/payments/verify/reverification-386.test.ts` asserts the lockfile is present, tracked, and a pnpm v9 lockfile
- `__tests__/app/api/payments/verify/reverification-363.test.ts` retains the earlier lockfile/CI contracts

## Concern: structural/textual reverification assertions

**Status:** documented (contract guards); behavioral coverage lives in `route.test.ts` (surface) and `verify-flow.test.ts` (critical paths)

| Critical path | Behavioral test |
| --- | --- |
| Confirm success → booking confirmed / payment paid | `verify-flow.test.ts` — moves a test-mode payment booking to confirmed |
| Fail / abandoned → hold released | `verify-flow.test.ts` — releases the held slot when payment fails; treats abandoned… |
| Missing reference / tenantId → 400 | `verify-flow.test.ts` — requires reference and tenantId |
| Unknown reference → 404 | `verify-flow.test.ts` — returns 404 when the payment reference is unknown |
| Provider throw → 502 | `verify-flow.test.ts` — returns 502 when the provider verify call throws |
| Still pending → booking stays pending | `verify-flow.test.ts` — leaves booking pending when provider status is still pending |

Structural guards (route thinness, lockfile/CI wiring, migration names) remain in
`reverification-363.test.ts`, `reverification-386.test.ts`, and `route.test.ts`
with comments explaining why they are not behavioral.

See comments in the reverification suites. Structural guards catch “LLM-reviewable shape” regressions (thin route, required symbols). Behavioral suites exercise payment confirm/fail and hold-release paths.

## Deferred (requires human / external evidence)

- LLM evaluation credentials unavailable during prior review
- “Re-verification passes” as a post-merge external outcome
