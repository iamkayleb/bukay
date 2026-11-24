## Issue #556 — keepalive round 567

Verified merchant empty states (tasks 1–6) and acceptance criteria:

- `pnpm build` — pass
- `pnpm vitest run` — 573 tests pass (including `issue-556-real-db.test.tsx` empty + demo tenants)
- `grep -rn "Nothing here yet" app/` — no matches

Added `acceptance: demo tenant with data does not show empty-state copy` to `issue-556-task-checklist.test.ts` so the PR task gate also guards acceptance criterion 3.

All prompt checkboxes marked complete in `cursor-prompt-567.md`.