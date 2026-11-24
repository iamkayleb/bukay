## Keepalive Next Task

Your objective is to satisfy the **Acceptance Criteria** by completing each **Task** within the defined **Scope**.

**This round you MUST:**
1. Implement actual code or test changes that advance at least one incomplete task toward acceptance.
2. Commit meaningful source code (.py, .yml, .js, etc.)—not just status/docs updates.
3. Mark a task checkbox complete ONLY after verifying the implementation works.
4. Focus on the FIRST unchecked task unless blocked, then move to the next.

**Guidelines:**
- Keep edits scoped to the current task rather than reshaping the entire PR.
- Use repository instructions, conventions, and tests to validate work.
- Prefer small, reviewable commits; leave clear notes when follow-up is required.
- Do NOT work on unrelated improvements until all PR tasks are complete.

## Pre-Commit Formatting Gate (Black)

Before you commit or push any Python (`.py`) changes, you MUST:
1. Run Black to format the relevant files (line length 100).
2. Verify formatting passes CI by running:
   `black --check --line-length 100 --exclude '(\.workflows-lib|node_modules)' .`
3. If the check fails, do NOT commit/push; format again until it passes.

**COVERAGE TASKS - SPECIAL RULES:**
If a task mentions "coverage" or a percentage target (e.g., "≥95%", "to 95%"), you MUST:
1. After adding tests, run TARGETED coverage verification to avoid timeouts:
   - For a specific script like `scripts/foo.py`, run:
     `pytest tests/scripts/test_foo.py --cov=scripts/foo --cov-report=term-missing -m "not slow"`
   - If no matching test file exists, run:
     `pytest tests/ --cov=scripts/foo --cov-report=term-missing -m "not slow" -x`
2. Find the specific script in the coverage output table
3. Verify the `Cover` column shows the target percentage or higher
4. Only mark the task complete if the actual coverage meets the target
5. If coverage is below target, add more tests until it meets the target

IMPORTANT: Always use `-m "not slow"` to skip slow integration tests that may timeout.
IMPORTANT: Use targeted `--cov=scripts/specific_module` instead of `--cov=scripts` for faster feedback.

A coverage task is NOT complete just because you added tests. It is complete ONLY when the coverage command output confirms the target is met.

**The Tasks and Acceptance Criteria are provided in the appendix below.** Work through them in order.

## Run context
---
## PR Tasks and Acceptance Criteria

**Progress:** 11/11 tasks complete, 0 remaining

### Scope
Every merchant screen shows a blank area when it has no data. A new merchant
sees five empty pages and cannot tell whether the app is broken, still loading,
or simply waiting for them to add something.

### Tasks
Complete these in order. Mark checkbox done ONLY after implementation is verified:

- [x] In `app/(app)/calendar/day-view.tsx`, when the chosen date has no bookings, show "No bookings on this date" with a link to add one.
- [x] In `app/(app)/services/services-list.tsx`, when the tenant has no services, show "No services yet — add your first so customers can book" above the create form.
- [x] In `app/(app)/clients/page.tsx`, when the tenant has no clients, show "No clients yet — they appear here after their first booking".
- [x] In `app/(app)/payments/payments-list.tsx`, when there are no payments, show "No payments yet" once that file exists.
- [x] In `app/(app)/today/data.tsx`, keep the existing "No appointments yet" message and link it to `/calendar` so the merchant can add one.
- [x] Add `__tests__/app/(app)/empty-states.test.tsx` rendering each page with an empty tenant and asserting each message appears.

### Acceptance Criteria
The PR is complete when ALL of these are satisfied:

- [x] `pnpm build` and `pnpm vitest run` pass with no new failures.
- [x] Against a real database with a tenant that has no services, no clients and no bookings, each of the five pages renders its message rather than an empty region.
- [x] None of those messages appears for the seeded demo tenant, which has data on every screen.
- [x] A merchant signs in to an empty tenant, opens `/clients`, reads that clients appear after their first booking, and is not left looking at a blank page.
- [x] `grep -rn "Nothing here yet" app/` returns nothing, confirming the old placeholder wording is gone.

### Suggested Next Task
- None — all PR tasks and acceptance criteria verified locally via `pnpm verify:issue-556:pr-complete`.

### Source Context
_For additional background, check these linked issues/PRs:_

Base: main
Head: cursor/issue-556

Source: https://github.com/iamkayleb/bukay/issues/556