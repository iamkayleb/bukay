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

**Progress:** 0/20 tasks complete, 20 remaining

### Scope
PR #113 addressed issue #112 but verification identified concerns (verdict: **CONCERNS**). This follow-up addresses the remaining gaps with improved task structure to ensure owner-facing schedule/blackout functionality, correct booking logic, robust migrations, and proper test coverage.

<!-- Updated WORKFLOW_OUTPUTS.md context:start -->
## Context for Agent

### Related Issues/PRs
- [#113](https://github.com/iamkayleb/bukay/issues/113)
- [#112](https://github.com/iamkayleb/bukay/issues/112)
<!-- Updated WORKFLOW_OUTPUTS.md context:end -->

### Tasks
Complete these in order. Mark checkbox done ONLY after implementation is verified:

- [ ] Implement owner-facing UI components/pages for editing weekly schedule (multiple open/close windows per weekday) and adding/removing blackout dates.
- [x] Add API endpoints to support reading and updating weekly schedule and blackout dates for a tenant.
- [ ] Wire getOpenWindows helper into all booking and availability logic, including existing booking routes and engine modules.
- [x] Update booking overlap logic to use interval overlap (startsAt < windowEnd && endsAt > windowStart) when checking for conflicting bookings.
- [x] Add unit tests covering booking overlap scenarios, especially bookings that start before an open window and overlap it.
- [x] Add unit and integration tests for owner workflow: setting weekly schedule and blackout dates via UI/API, verifying persistence and enforcement.
- [x] Remove tsconfig.tsbuildinfo from the repository and add it to .gitignore.
- [x] Add migration step to check for and resolve any duplicate BusinessHour rows per tenant/day before dropping the unique index.
- [x] Add validation and normalization logic in API/model layer to ensure blackout dates are always stored and queried in 'YYYY-MM-DD' format.

### Acceptance Criteria
The PR is complete when ALL of these are satisfied:

- [ ] Owner can set multiple open/close windows per weekday via the OwnerScheduleEditor UI, and changes are persisted and retrievable via the API.
- [ ] Owner can add and remove blackout dates via BlackoutDateEditor UI, and changes are persisted and retrievable via the API.
- [ ] API endpoints /api/schedule (GET, PUT) and /api/blackout (GET, POST, DELETE) allow reading and updating weekly schedule and blackout dates for a tenant, and changes are reflected in the database.
- [ ] The getOpenWindows helper is used in all booking and availability logic, including src/routes/bookings.ts and src/engine/availability.ts.
- [ ] Booking overlap logic uses interval overlap (startsAt < windowEnd && endsAt > windowStart) when checking for conflicting bookings.
- [ ] Unit tests in tests/bookingOverlap.test.ts cover scenarios where bookings start before an open window and overlap it, and all such tests pass.
- [ ] Unit and integration tests in tests/ownerSchedule.test.ts and tests/blackoutDates.test.ts verify that owner workflow (setting weekly schedule and blackout dates via UI/API) persists data and enforces schedule/blackout logic.
- [ ] tsconfig.tsbuildinfo is not present in the repository and is listed in .gitignore.
- [ ] Migration step checks for and resolves duplicate BusinessHour rows per tenant/day before dropping the unique index, and migration succeeds with no errors on production-like data.
- [ ] Blackout dates are always stored and queried in 'YYYY-MM-DD' format in the database and API responses.
- [ ] If a blackout date is set for a tenant, getOpenWindows returns an empty array for that date, and booking attempts on blackout dates are rejected by the API.

### Suggested Next Task
- Implement owner-facing UI components/pages for editing weekly schedule (multiple open/close windows per weekday) and adding/removing blackout dates.

### Source Context
_For additional background, check these linked issues/PRs:_

- Original PR: #113
- Parent issue: #112

---
