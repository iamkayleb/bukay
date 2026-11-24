## Verification (issue #556, PR #567)

Ran locally on `cursor/issue-556`:

- `pnpm verify:issue-556:pr-task-1` — pass
- `pnpm verify:issue-556:pr-tasks-1-6` — pass
- `pnpm verify:issue-556:acceptance-gate` — pass (`pnpm build`, acceptance vitest, `empty-states`, legacy grep)
- `pnpm vitest run` — 561 tests pass

Task 1 (`day-view.tsx`): empty chosen date shows **No bookings on this date.** via `MerchantEmptyState`, `data-testid="calendar-day-empty"`, and add-booking link to `?date=…#new-booking`.

**Follow-up:** PR #567 auto-status-summary still has unchecked task boxes; implementation and tests are complete — check off tasks and acceptance criteria on the PR body after this commit lands (auto-reconcile may match `day-view` / `empty-states` paths).