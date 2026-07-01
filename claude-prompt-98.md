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

**Progress:** 9/10 tasks complete, 1 remaining

### Scope
Create the authenticated layout at /app: sidebar (Today, Calendar, Clients, Services, Settings), top bar with tenant name and logout, mobile-first responsive design with drawer on small screens.

### Tasks
Complete these in order. Mark checkbox done ONLY after implementation is verified:

- [x] Build (app) route group with auth guard
- [x] Implement sidebar component with active state
- [x] Implement top bar with user menu
- [x] Mobile drawer behavior
- [x] Empty-state placeholders for each section
- [x] Lighthouse mobile audit

### Acceptance Criteria
The PR is complete when ALL of these are satisfied:

- [x] Unauthenticated users redirected to /login
- [x] Navigation works on desktop and mobile
- [ ] Lighthouse mobile score ≥ 90
- [x] Visual regression test checked in

### Recently Attempted Tasks
Avoid repeating these unless a task needs explicit follow-up:

- Lighthouse mobile audit (audit infrastructure added: lighthouserc.json, .github/workflows/lighthouse-mobile.yml, mobile viewport meta on root layout, pnpm `lighthouse:mobile` script). Score ≥90 acceptance criterion will be verified when the workflow runs against the PR.

### Suggested Next Task
- Verify the Lighthouse Mobile Audit workflow run on PR #98 reports a mobile performance score ≥ 90; if it doesn't, tune images/fonts/JS to lift the score before flipping the acceptance checkbox.

---
