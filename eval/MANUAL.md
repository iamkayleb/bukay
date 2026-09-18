# Running the lanes by hand

Three base branches, one agent each. You create each issue, apply the labels,
and watch the timeline. No seeding workflow, no automatic routing.

## Per issue — the whole recipe

1. **New issue.** Put the lane marker as the FIRST line of the body:

   ```
   <!-- base-branch: eval/claude -->

   ## Why
   ...
   ## Scope
   ...
   ## Tasks

   - [ ] Add `prisma/schema.prisma`: define the models
   ## Acceptance Criteria

   - [ ] `pnpm test` passes
   ```

   The belt dispatcher reads that marker and cuts the branch from that lane, so
   the PR targets `eval/claude` instead of the default branch.

2. **Labels:** `agent:claude` + `agents:auto-pilot`. Nothing else.

3. **Watch the issue timeline.** Auto-pilot comments each step. When it says
   "Waiting for agent to create branch", the belt has been dispatched.

Repeat with `eval/codex` + `agent:codex`, and `eval/cursor` + `agent:cursor`.

## The issue body must satisfy the format contract

Otherwise auto-pilot pauses with "Formatter output does not satisfy the
canonical issue-format contract".

- Every task names a concrete file or symbol in backticks —
  `` Add `lib/availability.ts`: implement computeSlots() ``, not
  "implement the availability engine".
- A path that does not exist yet must follow a creation verb
  (`create`/`add`/`write`), otherwise it reads as citing a missing file.
- Acceptance criteria must contain a runnable gate: `pnpm test`, `HTTP 200`,
  `curl`, "verified by". **`pnpm build` does NOT count.**
- Banned words in acceptance: clean, nice, good, fast, better, intuitive,
  polished, performant.

`eval/rounds/*.json` already satisfies all of this — copy the `tasks` and
`acceptance` arrays straight out of it.

## Watch for agent rotation

If an agent stalls, auto-pilot rotates the work to a different agent and records
`agents:tried-<agent>`. Good for shipping, **fatal for measurement** — it is why
round 1 ended up with Claude working Cursor's issues.

When you see `agents:tried-*` appear:

1. That agent **failed**. Record it — it is a real data point.
2. The `agent:*` label no longer reflects your intent. The issue **title** is the
   ground truth (`[eval r1] Scaffold product repo (cursor)`).
3. Decide: re-pin the original label and retry, or close it and score the failure.

Do not score from the current `agent:*` label. Score from the title.

## Stop levers

| Need | Do |
|---|---|
| Stop one issue | Add `agents:paused` or `needs-human` |
| Stop everything | `gh workflow disable agents-81-gate-followups.yml` |
| Bring back automation | `gh workflow enable <name>.yml` |

## Merging a lane

The upstream auto-merge only merges into the default branch, so lane PRs are
merged by hand — review, then Merge. Prefer a merge commit over a squash if you
are counting commits per agent.
