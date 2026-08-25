# Autonomous agent evaluation lanes

Runs an identical task list through each agent under test, on its own branch,
with verification and remediation happening without manual labelling.

```
eval/tasks.json
      │  Eval Seed Issues (workflow_dispatch)
      ▼
2 identical issues        agent:claude + <!-- base-branch: eval/claude -->
per spec                  agent:codex  + <!-- base-branch: eval/codex  -->
      │  agents:auto-pilot → shaping → issue bridge
      ▼
PR targets eval/<agent>   ← bridge reads the base-branch marker
      │  agents-81: run-claude / run-codex, autofix, hourly sweep
      ▼
Eval Lane Automation ── adds `automerge` ──► guarded-merge ──► eval/<agent>
      │  Eval Lane Automation adds `verify:compare` on merge
      ▼
Provider Comparison Report
      │  Eval Auto Followup reads the NEUTRAL judge
      ├── PASS ──────────────► done, score it
      └── CONCERNS/FAIL ─────► `verify:create-new-pr` → follow-up issue
                                (inherits the lane marker; chain caps at depth 2)
```

## One-time setup

1. Create the lanes off the default branch and push them:
   `eval/claude`, `eval/codex`.
2. **Do not** enable branch protection on `eval/*` — `guarded-merge` needs write
   access. Keep protection on the default branch.
3. Ensure these labels exist: `agent:claude`, `agent:codex`, `agents:auto-pilot`,
   `automerge`, `verify:compare`, `verify:create-new-pr`, `eval:round-1`.
4. Set `WORKFLOWS_APP_ID` / `WORKFLOWS_APP_PRIVATE_KEY`. This pipeline runs
   unattended; an expired PAT fails it silently.

## Running a round

1. Edit `eval/tasks.json`. Keep each spec's `tasks` at **10 or fewer** — larger
   issues exceed an agent session budget and stall mid-way.
2. **Actions → Eval Seed Issues → Run workflow** with `dry_run: true`. Read the
   summary.
3. Re-run with `dry_run: false`. Everything after this is automatic.
4. Check in once or twice a day (see below).

Seeding is idempotent: each issue carries an `<!-- eval-key: ... -->` marker and
re-running the same round skips what already exists. Bump `round` for a new one.

## Daily check-in

| Look at | Why |
|---|---|
| Issues labelled `needs-human` | The only queue that genuinely blocks |
| Open PRs on `eval/*` not advancing after ~2 sweep cycles | Stalled beyond the hourly sweep's reach |
| Provider Comparison Reports | Record the verdict **before** the follow-up round runs |
| `Agents PR Health` / `agents-weekly-metrics` | Fleet view |

## Scoring note

Follow-up rounds change the code that a later verdict grades. Record each
round's verdict **before** remediation runs, or the scorecard measures
"agent + remediation" instead of the agent. Weight the neutral (cross-family)
judge; discount same-family self-verdicts.

## Stop levers

| Need | Do |
|---|---|
| Stop one PR merging | Remove `automerge` |
| Stop one PR entirely | Add `agents:paused` or `needs-human` |
| Stop a round | Close the seeded issues |
| Hard stop everything | Disable `Agents Keepalive Sweep` |

## Known constraints

- **Unchecked tasks block `automerge`.** `guarded-merge` refuses any PR whose
  body or linked issue still has `- [ ]`. If PRs sit green but unmerged, this is
  why — run `agents-verifier` in `checkbox` mode to tick verified criteria.
- **Rate limits pace throughput.** Two agents times N issues will queue across
  session-cap windows. This is the real ceiling, not the automation.
- **Follow-up chains cap at depth 2**, then apply `needs-human` by design.
