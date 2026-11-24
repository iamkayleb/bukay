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
- All PR tasks verified locally (`pnpm verify:issue-556:pr-complete`).

### Source Context
_For additional background, check these linked issues/PRs:_

Base: main
Head: cursor/issue-556

Source: https://github.com/iamkayleb/bukay/issues/556

<!-- auto-status-summary:start -->
## Automated Status Summary

- **Progress:** 11/11 tasks complete (issue #556 merchant empty states).
- **Verified:** `pnpm build`, `pnpm vitest run` (582 tests), `pnpm verify:issue-556:pr-complete`, `issue-556-real-db.test.tsx`.
- **Task 1:** `day-view.tsx` shows `No bookings on this date.` plus `Add a booking` → `?date=…#new-booking` when the chosen day has zero bookings (not while loading).
<!-- auto-status-summary:end -->

---

## Repository Guidance
# AGENTS.md - Consumer Repository Context

> Read this before changing workflows, prompts, or synced automation files.

## Working Stance — Critical Evaluator (read first)

Your job is correct judgment, not agreement. Evaluate claims, designs, and instructions on the merits before agreeing — including the orchestrator's and the user's. When something is wrong, weaker than an alternative, or missing, say so plainly and lead with the strongest objection. Separate "this is correct" from "I'll do as asked." State your confidence and what would change your mind; flag what you are unsure of. Do not soften a real problem to be agreeable, and do not manufacture disagreement to seem rigorous — calibrated dissent, not maximal.

## This Is A Consumer Repo

Most workflow logic for this repository lives in `stranske/Workflows`. The consumer repo should only carry repo-specific configuration unless it has an explicitly documented exception.

## Source Of Truth

For infrastructure work, follow this order:

1. `stranske/Workflows` root docs: `README.md`, `docs/WORKFLOW_GUIDE.md`, `docs/ci/WORKFLOWS.md`
2. `stranske/Workflows/docs/INTEGRATION_GUIDE.md` and `docs/ops/CONSUMER_REPO_MAINTENANCE.md`
3. The consumer sync source in `stranske/Workflows/templates/consumer-repo/`
4. This repo's local repo-specific files

If a file is synced from Workflows, fix it in Workflows first.

## Current Consumer Defaults

- First-party consumers currently reference reusable workflows with `@main`. Match that unless you are intentionally pinning to an exact commit SHA for a controlled reason.
- `ci.yml` and `autofix-versions.env` are repo-specific.
- `pr-00-gate.yml` is a create-only standard file. Keep it aligned with the standard gate unless this repo has a documented reason to diverge.
- Synced workflows, prompts, scripts, and consumer docs are managed through `.github/sync-manifest.yml` in Workflows.

## Pull Request Readiness Invariant

- Automation-created pull requests must be opened ready for review. Do not create drafts or convert ready pull requests back to draft.
- Draft state is not a staging, dependency, stack-order, or opener-cap control. Use explicit labels, PR-body lifecycle state, disabled auto-merge, required checks, and exact-head merge guards instead.
- Before handing off or ending work, verify every pull request created or changed by the run is open and has `isDraft=false`. Convert a pre-existing draft to ready as a recovery action.
- Do not close an otherwise valid pull request merely to free automation capacity; preserve its branch and route the real blocker or dependency explicitly.

## Commonly Managed Files

Usually edit locally only when the file is repo-specific:

| File | Default owner | Notes |
|------|---------------|-------|
| `ci.yml` | Consumer repo | Repo-specific CI wiring |
| `autofix-versions.env` | Consumer repo | Repo-specific dependency pins |
| `pr-00-gate.yml` | Consumer repo, but should match Workflows standard by default | Create-only standard file |
| `agents-*.yml` | Workflows | Fix in Workflows, not here |
| `autofix.yml` | Workflows | Fix in Workflows, not here |
| `.github/codex/` prompts | Workflows | Fix in Workflows, not here |
| synced scripts/docs | Workflows | Fix in Workflows, not here |

## Current Workflow Surfaces

The current consumer default automation surface is centered on:

- `agents-issue-intake.yml`
- `agents-80-pr-event-hub.yml`
- `agents-81-gate-followups.yml`
- `agents-verifier.yml`
- `autofix.yml`
- `ci.yml`
- `pr-00-gate.yml`

Legacy compatibility workflows may still exist during migrations. Do not assume an older filename is canonical without checking the Workflows docs first.

## Cross-Repo Policy

Before editing local workflow infrastructure, ask:

**Does this work belong in `stranske/Workflows` instead?**

The answer is usually yes if the change affects any of these:

- reusable workflows
- agent prompts or routing
- keepalive/autofix/verifier behavior
- synced workflow files
- synced scripts or docs

If yes:

1. Make the source-of-truth change in `stranske/Workflows`
2. Update the sync manifest if a consumer-facing file changed
3. Sync or manually align this repo afterward

## Optional GitNexus Context

- GitNexus may be available as a local MCP/indexing layer for cross-repo search and impact checks.
- Use it opportunistically for workflow/template drift, blast-radius checks, and Workflows-vs-consumer ownership questions when indexes are fresh.
- Treat `.gitnexus/` as local derived cache. Do not commit it, require it in CI, or make correctness depend on it.
- If GitNexus is unavailable or stale, continue with normal `rg`, git, and repository tests.

## Useful References

- `stranske/Workflows/README.md`
- `stranske/Workflows/docs/WORKFLOW_GUIDE.md`
- `stranske/Workflows/docs/ci/WORKFLOWS.md`
- `stranske/Workflows/docs/INTEGRATION_GUIDE.md`
- `stranske/Workflows/docs/ops/CONSUMER_REPO_MAINTENANCE.md`
- `stranske/Workflows/docs/keepalive/Agents.md`
- `stranske/Travel-Plan-Permission` as a reference consumer

## Agent-Specific Note

This file is the agent-generic contract. Keep it materially aligned with `CLAUDE.md`; differences between the two should only be agent-specific execution notes, not different repository rules.
