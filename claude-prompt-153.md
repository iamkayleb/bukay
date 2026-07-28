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

**Progress:** 7/14 tasks complete, 7 remaining

### Scope
PR #63 addressed issue #62 and passed verification, but runtime concerns remain: static checks did not catch migration or seeding errors, and the implicit many-to-many join table between Staff and Service cannot include tenantId. This follow-up improves test coverage and schema structure to ensure tenant scoping and migration reliability.

<!-- Updated WORKFLOW_OUTPUTS.md context:start -->
## Context for Agent

### Related Issues/PRs
- [#63](https://github.com/iamkayleb/bukay/issues/63)
- [#62](https://github.com/iamkayleb/bukay/issues/62)
<!-- Updated WORKFLOW_OUTPUTS.md context:end -->

### Tasks
Complete these in order. Mark checkbox done ONLY after implementation is verified:

- [x] Create integration tests in `test/integration/prisma.test.ts` that run `prisma migrate dev` against a disposable SQLite or test Postgres database to verify migrations execute successfully.
- [x] Create integration tests in `test/integration/prisma.test.ts` that run `prisma db seed` against a disposable SQLite or test Postgres database to verify seeding executes successfully.
- [x] Update `package.json` to include a `prisma.seed` script that runs `ts-node prisma/seed.ts`.
- [x] Refactor `prisma/schema.prisma` to replace the implicit many-to-many join table between Staff and Service with an explicit `StaffService` model.
- [x] Add a `tenantId` field to the `StaffService` model in `prisma/schema.prisma`.
- [x] Add `@@index([tenantId])` to the `StaffService` model in `prisma/schema.prisma`.
- [x] Add `@@index([tenantId])` to every tenant-scoped table in `prisma/schema.prisma`.
- [x] Check in the updated `prisma/schema.prisma` file to version control.

### Acceptance Criteria
The PR is complete when ALL of these are satisfied:

- [ ] Integration tests in `test/integration/prisma.test.ts` running `prisma migrate dev` against the test database complete with exit code 0 and no errors, and all migrations are applied.
- [ ] Integration tests in `test/integration/prisma.test.ts` running `prisma db seed` against the test database insert a demo tenant and associated data.
- [x] The `package.json` file contains a `prisma.seed` script that runs `ts-node prisma/seed.ts`.
- [ ] The Prisma schema in `prisma/schema.prisma` defines an explicit `StaffService` model with a `tenantId` field and an `@@index([tenantId])`.
- [ ] Every tenant-scoped table in `prisma/schema.prisma` includes an explicit `@@index([tenantId])`.
- [ ] The `prisma/schema.prisma` file is checked into version control and reflects the latest model definitions, including the explicit `StaffService` model and all required indexes.

### Recently Attempted Tasks
Avoid repeating these unless a task needs explicit follow-up:

- Create integration tests in `test/integration/prisma.test.ts` that run `prisma db seed` against a disposable SQLite or test Postgres database to verify seeding executes successfully.
- Create integration tests in `test/integration/prisma.test.ts` that run `prisma migrate dev` against a disposable SQLite or test Postgres database to verify migrations execute successfully.
- Update `package.json` to include a `prisma.seed` script that runs `ts-node prisma/seed.ts`.

### Suggested Next Task
- Update `package.json` to include a `prisma.seed` script that runs `ts-node prisma/seed.ts`.

---
