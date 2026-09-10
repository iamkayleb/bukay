# Scoring methodology

How each (spec × agent) attempt is classified, what the numbers mean, and the
biases a reader should know about before trusting them.

## Why not just use the judge's quality score

The original design scored merged work with a cross-family LLM judge. That
measures output quality *conditional on the agent having produced output at all* —
and in practice, producing output at all turned out to be the harder problem.
Most attempts never reached a judge.

The primary metric is therefore **unaided completion**: did this agent, assigned
this task, produce a mergeable pull request without another agent taking over?
Quality scores are reported as a secondary axis for attempts that got that far.

## Outcome classification

Every (spec × agent) attempt lands in exactly one bucket.

| Outcome | Definition | Evidence |
|---|---|---|
| **Unaided** | The assigned agent created its branch, produced commits, and its PR merged into its own lane | PR head prefix matches the assigned agent; base is that agent's lane |
| **Assisted** | The assigned agent stalled; the pipeline rotated the work to a different agent | `agents:tried-<assigned>` on the issue; PR head prefix names a different agent |
| **Abandoned** | Every eligible agent was tried; no PR merged | `needs-human` applied after the rotation set was exhausted |

**Ground truth for the assignment is the issue title** (`[eval r1] Scaffold
product repo (cursor)`), not the current `agent:*` label. Rotation rewrites that
label, so scoring from it silently credits the wrong agent.

## Cause classification (required for every non-Unaided outcome)

An agent that never ran is not an agent that failed. Before recording a failure,
open the runner log for that attempt and tag the cause:

| Tag | Meaning | Typical evidence |
|---|---|---|
| `infra` | The agent never got a fair attempt | expired or missing credentials, quota exhausted, dispatch rejected, approval gate, workflow error |
| `capability` | The agent ran and did not produce usable work | CLI executed, no commits, or commits that fail the acceptance criteria |

**This distinction decides whether a number is a finding or an artifact.** Reporting
"Codex 0/5" without it invites the obvious objection that an expired
`CODEX_AUTH_JSON` was measured instead of Codex.

## Reported metrics

Per agent, per round:

- **Unaided completion rate** — Unaided ÷ attempts assigned. The headline number.
- **Infrastructure failure rate** — `infra`-tagged ÷ attempts assigned. Evidence
  for the project's central claim.
- **Capability failure rate** — `capability`-tagged ÷ attempts assigned.
- **Rescue count** — how often this agent completed work another agent abandoned.
- **Median commits and iterations to merge**, for Unaided attempts only.
- **Neutral-judge verdict**, for merged work only (see the judge table below).

## Known biases — state these in the report

1. **Rotation order is deterministic.** The pipeline selects the next eligible
   agent as `remaining[0]` from the registry, so the same agent is always tried
   first and absorbs a disproportionate share of first attempts. Record the
   registry order; rotate it between rounds if you run more than a few.
2. **Rescuers inherit a different task.** The first agent works a clean branch;
   a rescuer inherits whatever the first left behind. Assisted outcomes are not
   symmetric evidence about the rescuer's ability on the original task.
3. **Plan tiers differ.** Claude and Codex run on flat-rate subscriptions whose
   throttle is a rate limit; Cursor runs on a metered plan whose throttle is a
   quota. A quota stall is an `infra` outcome, not a capability one, and the tier
   must be reported alongside the numbers.
4. **The judge differs per agent.** Cross-family judging means no single grader
   scores everyone:

   | Agent | Self (discount) | Neutral (weight) |
   |---|---|---|
   | `claude` | Anthropic | **OpenAI** |
   | `codex` | OpenAI | **Anthropic** |
   | `cursor` | none fixed* | **OpenAI** |

   \* Cursor is a harness over other providers' models and has no fixed family,
   so either judge could be a self-verdict. Treat its quality scores as weaker
   evidence.
5. **Round order is not independent.** Round N+1 builds on round N's code, so a
   weak foundation compounds. Report per-round results; do not pool them.

## Recording template

One row per (spec × agent). Fill it as each attempt resolves — reconstructing
later from labels is unreliable, because rotation overwrites them.

```
round | spec      | assigned | outcome  | cause      | rescuer | commits | iters | verdict | notes
1     | scaffold  | claude   | unaided  | -          | -       | 4       | 3     | PASS    |
1     | scaffold  | codex    | assisted | infra      | cursor  | -       | -     | -       | expired auth, run 3412…
1     | scaffold  | cursor   | unaided  | -          | -       | 7       | 5     | CONCERNS|
```

## The lane-purity rule

Rotation changes the agent but **not** the base branch — the `<!-- base-branch -->`
marker lives in the issue body, which rotation never edits. An assisted attempt
therefore tries to merge one agent's work into another agent's lane.

**Do not merge a PR whose head prefix does not match its lane.** Close it, record
the Assisted outcome, and leave the lane clean. The measurement is preserved; the
deliverable stays attributable.

```bash
gh pr list --repo iamkayleb/bukay --state open \
  --json number,headRefName,baseRefName \
  -q '.[] | "\(.number) head=\(.headRefName) base=\(.baseRefName)"'
```

`codex/issue-241 → eval/claude` is a reject.
