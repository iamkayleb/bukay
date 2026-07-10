# Fix CI Failures

The CI pipeline is failing. Your **only objective** is to fix the failing checks so they pass.

## Rules

**DO NOT:**
- Work on new features or tasks from the checklist
- Refactor unrelated code
- Update documentation or comments
- Make stylistic changes beyond what's needed to fix the failure

**DO:**
1. Identify which checks are failing (test, mypy, lint, type-check)
2. Read the error output carefully to understand the root cause
3. Make minimal, targeted fixes that address the specific failures
4. Verify your changes don't break other tests
5. Commit with message: `fix: resolve CI failures`

## Pre-Commit Formatting Gate (Black)

If CI is failing due to Black formatting (e.g., "would reformat"), you MUST:
1. Run Black to format the relevant files (line length 100).
2. Verify formatting passes by running:
   `black --check --line-length 100 --exclude '(\.workflows-lib|node_modules)' .`
3. Do NOT commit/push until the check passes.

## Failure Types

### Test Failures
- Read the test name and assertion error
- Check if the test expectation is correct or if the implementation is wrong
- Fix the implementation if the test is correct
- Only modify tests if they have genuine bugs

### Mypy / Type Errors
- Read the exact error message and line number
- Add type annotations where missing
- Fix type mismatches (wrong return type, incompatible arguments)
- Use `# type: ignore` sparingly and only when truly necessary

### Lint Errors
- These are usually handled by autofix, but if you see them:
- Follow the linter's suggestion
- Don't over-engineer the fix

## Exit Criteria

Once all CI checks pass, the keepalive loop will automatically resume normal task work using the standard prompt.

---

**Focus solely on making CI green. Do not advance other work until checks pass.**

## Run context
---
## PR Tasks and Acceptance Criteria

**Progress:** 0/45 tasks complete, 45 remaining

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
  - [ ] Define scope for: Implement owner-facing UI components/pages for editing weekly schedule (multiple open/close windows per weekday) (verify: confirm completion in repo)
  - [ ] Implement focused slice for: Implement owner-facing UI components/pages for editing weekly schedule (multiple open/close windows per weekday) (verify: confirm completion in repo)
  - [ ] Validate focused slice for: Implement owner-facing UI components/pages for editing weekly schedule (multiple open/close windows per weekday) (verify: confirm completion in repo) adding/removing blackout dates. (verify: formatter passes)
- [ ] Add API endpoints to support reading and updating weekly schedule and blackout dates for a tenant.
  - [ ] Add API endpoints to support reading (verify: confirm completion in repo) updating weekly schedule (verify: confirm completion in repo) blackout dates for a tenant. (verify: formatter passes)
- [ ] Wire getOpenWindows helper into all booking and availability logic, including existing booking routes and engine modules.
  - [ ] Wire getOpenWindows helper into all booking (verify: confirm completion in repo) availability logic (verify: confirm completion in repo) including existing booking routes (verify: confirm completion in repo) including engine modules. (verify: confirm completion in repo)
- [ ] Update booking overlap logic to use interval overlap (startsAt < windowEnd && endsAt > windowStart) when checking for conflicting bookings.
  - [ ] Define approach for: Update booking overlap logic to use interval overlap (startsAt < windowEnd && endsAt > windowStart) when checking for conflicting bookings. (verify: confirm completion in repo)
  - [ ] Define scope for: Implement: Update booking overlap logic to use interval overlap (startsAt < windowEnd && endsAt > windowStart) when checking for conflicting bookings. (verify: confirm completion in repo)
  - [ ] Implement focused slice for: Implement: Update booking overlap logic to use interval overlap (startsAt < windowEnd && endsAt > windowStart) when checking for conflicting bookings. (verify: confirm completion in repo)
  - [ ] Validate focused slice for: Implement: Update booking overlap logic to use interval overlap (startsAt < windowEnd && endsAt > windowStart) when checking for conflicting bookings. (verify: confirm completion in repo)
  - [ ] Define scope for: Validate: Update booking overlap logic to use interval overlap (startsAt < windowEnd && endsAt > windowStart) when checking for conflicting bookings. (verify: confirm completion in repo)
  - [ ] Implement focused slice for: Validate: Update booking overlap logic to use interval overlap (startsAt < windowEnd && endsAt > windowStart) when checking for conflicting bookings. (verify: confirm completion in repo)
  - [ ] Validate focused slice for: Validate: Update booking overlap logic to use interval overlap (startsAt < windowEnd && endsAt > windowStart) when checking for conflicting bookings. (verify: confirm completion in repo)
- [ ] Add unit tests covering booking overlap scenarios, especially bookings that start before an open window and overlap it.
  - [ ] Add unit tests covering booking overlap scenarios (verify: tests pass) especially bookings that start before an open window (verify: tests pass) overlap it. (verify: confirm completion in repo)
- [ ] Add unit and integration tests for owner workflow: setting weekly schedule and blackout dates via UI/API, verifying persistence and enforcement.
  - [ ] Add unit (verify: confirm completion in repo) integration tests for owner workflow: setting weekly schedule (verify: tests pass) blackout dates via UI/API (verify: formatter passes) verifying persistence (verify: formatter passes) enforcement. (verify: confirm completion in repo)
- [ ] Remove tsconfig.tsbuildinfo from the repository and add it to .gitignore.
  - [ ] Remove tsconfig.tsbuildinfo from the repository (verify: config validated) add it to .gitignore. (verify: confirm completion in repo)
- [ ] Add migration step to check for and resolve any duplicate BusinessHour rows per tenant/day before dropping the unique index.
  - [ ] Define scope for: Add migration step to check for (verify: confirm completion in repo)
  - [ ] Implement focused slice for: Add migration step to check for (verify: confirm completion in repo)
  - [ ] Validate focused slice for: Add migration step to check for (verify: confirm completion in repo)
  - [ ] Define scope for: resolve any duplicate BusinessHour rows per tenant/day before dropping the unique index. (verify: confirm completion in repo)
  - [ ] Implement focused slice for: resolve any duplicate BusinessHour rows per tenant/day before dropping the unique index. (verify: confirm completion in repo)
  - [ ] Validate focused slice for: resolve any duplicate BusinessHour rows per tenant/day before dropping the unique index. (verify: confirm completion in repo)
- [ ] Add validation and normalization logic in API/model layer to ensure blackout dates are always stored and queried in 'YYYY-MM-DD' format.
  - [ ] Add validation (verify: confirm completion in repo)
  - [ ] Define scope for: normalization logic in API/model layer to ensure blackout dates are always stored (verify: formatter passes)
  - [ ] Implement focused slice for: normalization logic in API/model layer to ensure blackout dates are always stored (verify: formatter passes)
  - [ ] Validate focused slice for: normalization logic in API/model layer to ensure blackout dates are always stored (verify: formatter passes) queried in 'YYYY-MM-DD' format. (verify: formatter passes)

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

### Recently Attempted Tasks
Avoid repeating these unless a task needs explicit follow-up:

- Implement owner-facing UI components/pages for editing weekly schedule (multiple open/close windows per weekday) and adding/removing blackout dates.

### Suggested Next Task
- Define scope for: Implement owner-facing UI components/pages for editing weekly schedule (multiple open/close windows per weekday) (verify: confirm completion in repo)

### Source Context
_For additional background, check these linked issues/PRs:_

- Original PR: #113
- Parent issue: #112

---
