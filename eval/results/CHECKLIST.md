# Per-round checklist

Run this for every round. It is short because the expensive failures were all
things nobody checked.

## Before seeding

```bash
# 1. Are the fixes actually in this repo? (not just merged in Workflows)
grep -c "danger-full-access"  .github/workflows/agents-81-gate-followups.yml   # >=1
grep -c "base-branch"         .github/workflows/agents-auto-pilot.yml          # >=1
grep -c "base-branch"         .github/workflows/agents-71-codex-belt-dispatcher.yml  # >=1
grep -c "run-cursor"          .github/workflows/agents-81-gate-followups.yml   # >=1

# 2. Do the lanes exist and start level?
for b in eval/claude eval/codex eval/cursor; do
  echo "$b ahead of main by $(git rev-list --count origin/main..origin/$b)"
done

# 3. Is the round's work actually unbuilt? (avoids the rounds 1-5 mistake)
#    Check a few cited paths from the spec do NOT exist yet.
```

## Seeding

```bash
./eval/create-round.sh N            # dry run — read it
./eval/create-round.sh N --apply
```

Expect `specs x 3` issues, no "skip (exists)".

## While it runs

```bash
./eval/../check273.sh <issue>       # body, labels, comments, runs, branch
```

| Symptom | Meaning | Action |
|---|---|---|
| `Gate: cancelled` | contention, not failure | re-run Gate, then add `agent:retry` |
| `agent-run-skipped` + `duplicate-completed` | debounce, head SHA unchanged | normal, ignore |
| Paused during formatting | body failed the contract | `./eval/fix-one-issue.sh <n> --apply` |
| Green job, no files | **read the agent transcript** | `./codex-output.sh <run>` |

## Before merging any PR

```bash
gh pr list --repo iamkayleb/bukay --state open \
  --json number,title,headRefName,baseRefName \
  -q '.[] | select(.title|contains("[eval r")) | "#\(.number) \(.headRefName) -> \(.baseRefName)"'
```

- head prefix **must** match its lane: `codex/issue-N -> eval/codex`
- `-> main` means the base fix did not reach this repo — **do not merge**
- prefix not matching the lane means rotation occurred — close it, record
  the Assisted outcome, keep the lane clean

## Recording (do it as it happens, not afterwards)

One row per (spec x agent) in `eval/results/ROUND-NN.md`:

```
round | spec | assigned | outcome | cause | rescuer | commits | iters | verdict | notes
```

- `outcome` — Unaided / Assisted / Abandoned
- `cause` — `infra` or `capability`, **required** for anything not Unaided
- Ground truth for `assigned` is the **issue title**, never the current
  `agent:*` label; rotation rewrites the label.

## Non-negotiable before scoring a failure

Open the agent's transcript artifact (`codex-output-<pr>`,
`claude-output-<pr>`). If it names an environment blocker, the outcome is
`infra` and the round must be rerun for that agent. Two rounds of Codex results
were nearly published as capability failures because nobody opened it.
