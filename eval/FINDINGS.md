# Operational Findings Log

A running record of what actually stopped the multi-agent pipeline, why, and
what fixed it. Kept alongside the evaluation because it answers a question the
scorecards do not: **where does the time really go?**

> **Working thesis.** Across every stall recorded here, the bottleneck was
> operational reliability, not model capability. When an agent finally reached a
> correctly provisioned pipeline it completed its work on the first attempt.
> Nineteen of twenty findings below are plumbing.

## How to add an entry

Copy the block, put it at the top of **Findings**, and renumber nothing — ids
are permanent so the report can cite them.

```markdown
### F-NN — Short title
- **Date:**
- **Category:** credential-scope | configuration | contract | design-gap | methodology | tooling | by-design
- **Symptom:** what was visible, quoted verbatim where possible
- **Root cause:** what was actually wrong
- **Fix:** the change, with commit or PR
- **Time to diagnose:** rough, honest
- **Lesson:** what would have caught it sooner
```

## Summary

| Category | Count | What it means |
|---|---:|---|
| Credential / scope | 7 | A credential existed and was valid, but under-scoped or expired |
| Design gap | 12 | The system could not express what we needed |
| Contract / format | 3 | Input rejected by a quality gate |
| Configuration | 4 | A switch that gates whole workflows was unset |
| Tooling | 2 | Scripts and helpers around the pipeline |
| Methodology | 2 | The measurement itself was wrong |
| By design | 1 | Correct behaviour that looked like a fault |

**The dominant pattern is not "broken" — it is "present but misprovisioned."**
Five separate stalls were a token, app, or workflow permission that existed and
looked healthy. Each surfaced as a misleading symptom somewhere else.

## Findings

### F-36 — Conflict resolver baked a `main` merge into three lane branches
- **Date:** 2026-09-16
- **Category:** design-gap
- **Symptom:** PRs #331, #339 and #343 each showed ~300 files changed against
  `eval/codex`, edits to five protected `.github/workflows/` files, and deletion
  of live lane work (`app/[slug]/page.tsx`, `app/[slug]/data.ts`, the
  `20260910152002_add_tenant_active` migration, two test files). The genuine task
  work in each was 5-7 files.
- **Root cause:** A sequencing hazard, not a bad branch. The branches were cut
  correctly from `eval/codex` (merge-base `a3e32d2`). Their PRs were then opened
  against `main`, so the autofix conflict path ran
  `.github/codex/prompts/fix_merge_conflicts.md` with `{{base_branch}}` bound to
  the PR's base *at that moment* — `main`. `github-actions[bot]` committed
  `e88d6b8` and `4ba1b6b` ("fix: resolve merge conflicts with `main`", parents
  `a3e32d2` + `63e0737`). The base was retargeted to `eval/codex` afterwards. The
  merge is permanent: the branch now carries main's whole delta, including
  `ee9909d`, which reverts the lane's own work. Retargeting a base does not
  unwind a merge already in the history.
- **Fix:** `eval-lane-base-guard.yml` retargets on `opened`, closing the window
  before autofix can run; these three PRs predate it. Salvage was by cherry-pick
  onto a branch freshly cut from `eval/codex` (bukay #356, 7 files, zero workflow
  edits), then closing all three. Still open: the guard should also refuse a
  lane-bound branch whose history already contains a merge of the default branch,
  because after that point retargeting produces a correct-looking PR with a
  catastrophic diff.
- **Time to diagnose:** ~2 hours across two sessions, including one wrong
  diagnosis of my own — I first reported the branches were *cut* from `main`,
  which the commit parents disprove.
- **Lesson:** Two safeguards that are individually correct can still lose to
  ordering. The base guard and the conflict resolver were both right; only their
  relative timing was wrong. Also: "N files changed" is a claim about a
  merge-base, so verify the merge-base before trusting the number — and verify it
  before *dismissing* it, which is the error I made when I blamed a shallow clone
  for numbers that turned out to be exact.

### F-35 — Follow-up issues defaulted to the wrong agent
- **Date:** 2026-09-15
- **Category:** methodology
- **Symptom:** Issue #318, a follow-up remediating **Claude's** PR #266, was created
  with `agent:codex`, `from:codex` and `runner:codex`. Codex would have been sent
  to fix code Claude wrote, and the result recorded against the wrong agent.
- **Root cause:** `agents-verify-to-new-pr` resolved the agent from the merged
  PR's labels and, on any failure, fell back to the registry default (`codex`):
  `} catch (err) { agentKey = _defaultAgent; }`.
  `resolveAgentFromLabels` throws when a PR carries zero or several `agent:*`
  labels — precisely what stall rotation (F-07 family) leaves behind — so every
  rotated PR's follow-up silently became Codex, with only a log warning.
- **Fix:** Resolution order is now PR label, then the **parent issue's** label
  (via the `<!-- meta:issue:N -->` marker or a Closes reference), then the
  registry default with an explicit warning (Workflows `0c31a1b7`).
- **Lesson:** A default that is reasonable for ordinary work can be incoherent
  for a specialised one. Guessing an agent is fine when any capable agent will
  do; a follow-up by definition remediates one specific agent's output.

### F-34 — Base-branch propagation: three readers, no writer
- **Date:** 2026-09-15
- **Category:** design-gap
- **Symptom:** Follow-up PRs kept targeting the default branch even after the
  issue bridge, the belt dispatcher and auto-pilot had all been taught to read
  the `<!-- base-branch: X -->` marker.
- **Root cause:** Nothing was **writing** the marker into follow-up issues. The
  propagation existed only in the Workflows repository's own copy of
  `agents-verify-to-new-pr`; the consumer template had none of it. Three readers
  had been fixed one at a time, each after a PR landed on the wrong base, while
  the writer was never deployed.
- **Consequence:** PR #323 was cut from the default branch, so Codex could not
  see its own rounds 6-7 work. It rebuilt `app/[slug]/page.tsx` — which already
  existed in its lane — and never touched the `ics.ts` and `tokens.ts`
  deliverables the follow-up actually named. Gate failed; the verdict would have
  read as a Codex quality failure.
- **Fix:** Ported the propagation into the consumer template
  (Workflows `5ff067f6`), delivered by sync at 2026-09-14 13:30 UTC.
- **Lesson:** A marker-passing design has readers *and* a writer. Fixing readers
  in response to symptoms never surfaces a missing writer, because the symptom
  is identical. Trace the whole path once instead of patching where it hurts.

### F-33 — The remediation loop had never run
- **Date:** 2026-09-14
- **Category:** design-gap
- **Symptom:** Every merged eval PR carried a CONCERNS or FAIL verdict and none
  produced a follow-up. `eval-auto-followup` showed runs, all `skipped`.
- **Root cause:** Two independent blockers. (1) The verifier posts its Provider
  Comparison Report with `GITHUB_TOKEN`, which raises no `issue_comment` event
  for other workflows, so the trigger fired only on unrelated comments and the
  job's `if` correctly skipped them. (2) With no Anthropic slot configured
  (F-32), a Codex PR had no cross-family judge at all and was skipped by design.
- **Fix:** Re-triggered on `workflow_run: ["Agents Verifier"] completed` plus a
  manual dispatch, with the script fetching the report itself rather than
  relying on a comment being in the event payload.
- **Lesson:** Third instance of GitHub's `GITHUB_TOKEN` loop guard in this
  project (F-08, F-31, this). Any workflow that reacts to something another
  workflow creates needs that creator to use an App token — and the symptom is
  always silence, never an error.

### F-32 — Cross-family judging silently unavailable
- **Date:** 2026-09-14
- **Category:** credential-scope
- **Symptom:** Every Provider Comparison Report showed two rows, both OpenAI —
  `openai/gpt-5.6-terra` and `github-models/openai/gpt-5`, the second with
  confidence `N/A` and the text *"Review the PR manually or re-run once LLM
  credentials are available."*
- **Root cause:** `llm_slots.json` already declared an `anthropic` slot, but
  `CLAUDE_API_STRANSKE` was not set in the consumer. The verifier logged
  *"Compare will fall back to OpenAI/GitHub Models"* and exited green.
- **Consequence:** For a Codex PR, both judges were same-family, so no neutral
  verdict existed and the follow-up selector skipped it entirely. Codex was
  unscoreable and nobody noticed, because the report looked complete.
- **Fix:** Set `CLAUDE_API_STRANSKE`. No code change — the slot was configured
  all along.
- **Lesson:** A degraded judge panel still produces an authoritative-looking
  report. Assert that the configured slots actually returned verdicts, rather
  than trusting the report's existence.

### F-31 — Follow-up issues never triggered auto-pilot
- **Date:** 2026-09-15
- **Category:** credential-scope
- **Symptom:** Every follow-up issue had to have `agents:auto-pilot` removed and
  re-added by hand before work started, on every iteration.
- **Root cause:** `agents-verify-to-new-pr` selected `OWNER_PR_PAT`, then
  `SERVICE_BOT_PAT`, then `GITHUB_TOKEN` — and never tried a GitHub App token,
  unlike the rest of the fleet. With neither PAT set, issues and labels were
  created with `GITHUB_TOKEN`, which raises no events for other workflows.
- **Fix:** Mint and prefer an App token, keeping the PAT chain as fallback, and
  warn explicitly when only `GITHUB_TOKEN` is available (Workflows `c2d35786`).
- **Lesson:** The automatic loop silently required a manual step on every cycle.
  A fallback chain that ends in a token known not to trigger events should say so.

### F-30 — Four independent debounces, each able to stall work silently
- **Date:** 2026-09-14
- **Category:** design-gap
- **Symptom:** Work repeatedly stopped with no error anywhere: `agent-run-skipped`,
  `duplicate-pending`, `Report unchanged state skip`, `Too many optimizer runs`.
- **Root cause:** Four separate suppression mechanisms, each individually
  sensible: the runner dispatch fingerprint (PR + head SHA + provider, 30-minute
  pending expiry), the verifier state fingerprint (stored in a PR comment, **no
  force flag**), the optimizer recursion guard (F-21), and workflow concurrency
  cancellation. A cancelled run reserves a dispatch slot and never records
  completion, so `duplicate-pending` suppresses every retry until the record goes
  stale — and `agent:retry` does not clear it.
- **Fix:** No single fix. Each needs a documented override: push a new head SHA
  for the dispatch debounce; delete the `<!-- fingerprint:... -->` comment for
  the verifier; wait out or re-label for the optimizer.
- **Lesson:** With enough independent guards, **"nothing happened" becomes the
  default outcome** and every one needs a documented way to override it. This is
  the single largest throughput drag observed in the project.

### F-26 — Backticked paths in prose counted as evidence citations
- **Date:** 2026-09-10
- **Category:** contract
- **Symptom:** Every round-6 issue paused with *"Formatter output does not
  satisfy the canonical issue-format contract"* despite bodies that passed the
  validator locally.
- **Root cause:** The validator treats every backticked slash-token as a cited
  file path, including ones in prose. Guidance text added to Non-Goals and
  Implementation Notes (`` `.github/` ``, `` `app/lib/` ``, `` `__tests__/` ``,
  `` `eval/cursor` ``) pushed the citation count past the threshold of three,
  after which the body fails unless at least one path resolves against whatever
  directory the formatter runs in.
- **Fix:** Name directories in plain words in prose; keep backticks for task
  paths only. Verified across 84 bodies under three repository roots including
  an empty directory.
- **Lesson:** The layout hint added to prevent one failure caused another. A
  validator that parses prose as data makes prose part of the contract.

### F-25 — Task decomposer strips the file path from compound tasks
- **Date:** 2026-09-10
- **Category:** design-gap
- **Symptom:** Same generic contract failure, on bodies that were already
  formatter-immune.
- **Root cause:** The decomposer splits a task on "and" and emits nested
  sub-checkboxes. The tail fragment loses the backticked path:
  `` Add `app/[slug]/head.tsx`: add SEO and Open Graph tags `` became
  `` Open Graph tags (verify: confirm completion in repo) ``, which fails the
  rule that every task must name a concrete file, symbol, path or command.
  The validator matches indented checkboxes, so one fragment fails the body.
- **Fix:** Rewrote 10 compound tasks across rounds 6-19 into atomic tasks that
  each name their file, leaving the decomposer nothing to split.
- **Lesson:** The pipeline rewrites the issue before validating it, so authoring
  a body that passes the validator is not sufficient — it must also survive
  every transformation applied to it first.

### F-24 — The same hardcoded default branch in three separate components
- **Date:** 2026-09-10
- **Category:** design-gap
- **Symptom:** An issue marked `<!-- base-branch: eval/cursor -->` produced
  branch `cursor/issue-285` and a pull request into `main`.
- **Root cause:** Three components compute a pull request base. The issue bridge
  and the belt dispatcher were fixed to read the marker; **auto-pilot, which
  actually calls `pulls.create`, was not** — it had four `default_branch`
  assignments and zero references to the marker. The marker was honoured when
  the branch was cut and ignored when the PR was opened.
- **Fix:** Both of auto-pilot's PR sites now resolve marker over default with an
  existence guard (Workflows `cb15ccf7`).
- **Lesson:** Fixed twice, declared done twice, wrong both times. The lesson was
  written down after the second instance and not applied. When removing a
  hardcoded default, grep the whole surface for the pattern before claiming it
  is fixed — and identify which component performs the action, not which one is
  nearest the symptom.

### F-23 — Codex blocked by its own sandbox, silently, for two rounds
- **Date:** 2026-09-11
- **Category:** configuration
- **Symptom:** Codex produced no code across two evaluation rounds. Its jobs
  were green, the ledger closed each task as `done`, and the only commits were
  telemetry timestamps. It looked exactly like an agent that does nothing.
- **Root cause:** `sandbox: workspace-write` makes Codex isolate with
  bubblewrap, which cannot create a loopback interface on a GitHub-hosted
  runner. Every shell command failed before running. Codex's session recorded
  **0 commands executed, 0 files changed**, and its transcript said so plainly:
  *"the workspace shell fails before any command runs
  (`bwrap: loopback: Failed RTM_NEWADDR: Operation not permitted`)"*.
- **Fix:** `sandbox: danger-full-access` on both Codex paths in the consolidated
  loop (Workflows `43cbb88f`). The runner is an ephemeral single-tenant VM and
  is already the isolation boundary.
- **Time to diagnose:** Two rounds and roughly a day, across six diagnostic
  passes. Three of those aimed at the wrong workflow; two mistook shell script
  source printed in the run log for executed output.
- **Lessons:**
  - **The agent said exactly what was wrong and nothing read it.** The
    transcript was uploaded as `codex-output-<pr>` on every run. Read the
    agent's own output before theorising about the agent.
  - `gh run view --log` prints the source of `run:` steps. An `echo "reason=x"`
    line appears whether or not that branch executed — twice this produced
    confident, wrong conclusions.
  - A green job that produced no file is not success. The runner should fail,
    or at least flag, when an agent executes zero commands.
  - **Two rounds of Codex results were nearly recorded as capability failures.**
    Without the transcript the write-up would have said Codex cannot implement
    a pure function, which is false.

### F-22 — Every bot-dispatched workflow run held for manual approval
- **Date:** 2026-09-07
- **Category:** configuration
- **Symptom:** Six evaluation issues sat for days in `Auto-pilot step 1: Waiting
  for agent to create branch...` with exponential backoff (2m, 4m, 8m) and no
  branch ever appearing. Auto-pilot runs concluded **success**. The belt
  dispatcher it dispatches showed ten runs, all failed in 1-2 seconds, with an
  empty JOBS list and `failed to get run log: log not found`. Conclusion was
  `action_required`. The run page read: *"GitHub detected that this workflow
  file may be malicious. It will not run until someone with write access
  approves it."*
- **Root cause:** Settings -> Actions -> General -> *Approval for running fork
  pull request workflows* was set to **"Require approval for all external
  contributors"**, which covers *"all users that are not a member or owner of
  this repository"*. Workflow runs are dispatched by the GitHub App bot
  (`workflows-phase-2[bot]`), which is an installation rather than a member, so
  **every run it triggered was frozen pending a human click** — indefinitely,
  because nobody knew to look. The workflow file was never the problem; that
  banner is GitHub's generic wording for this gate.
- **Fix:** Set the approval scope to *"Require approval for first-time
  contributors who are new to GitHub"*, and enable *"Allow GitHub Actions to
  create and approve pull requests"* (which was also off and would have blocked
  PR creation on the `GITHUB_TOKEN` fallback path immediately afterwards).
- **Time to diagnose:** Days, across two separate investigations.
- **Lessons:**
  - **`action_required` means "a human must click approve", not "something
    failed".** It is a queue state, not an error. The same code appeared earlier
    on the Gate and was misattributed to workflow permissions — the same gate,
    missed twice.
  - **A run with zero jobs and no log never started.** That shape distinguishes
    "held or rejected before scheduling" from "ran and failed", and it should be
    the first thing checked, before any theory about the workflow's contents.
  - An autonomous pipeline whose actor is a bot cannot tolerate a
    human-approval gate on that actor. Five hypotheses were pursued and
    discarded — swallowed dispatch warning, missing composite actions, invalid
    YAML, stale sync, concurrency cancellation — each reasoned forward from the
    workflow source instead of reading what the run had recorded.

### F-21 — Optimizer recursion guard counted runs that did no work
- **Date:** 2026-09-06
- **Category:** design-gap
- **Symptom:** Every seeded issue failed at `Check optimizer recursion guard`:
  *"Optimizer runs for issue #246 in last hour: 5 … Too many optimizer runs
  (5 > 3) in last hour"* — on issues where the optimizer had done real work at
  most twice.
- **Root cause:** The guard counted every workflow run whose `run-name` ended
  with the issue number, with no filter on whether the run did anything. The
  optimizer triggers on **every** `issues: labeled` event, but only
  `agents:format`, `agents:optimize`, `agents:apply-suggestions` and
  `workflow_dispatch` get past the trigger check. Every other label spawns a run
  that exits immediately — and still consumed one of the four slots. Seeding an
  issue with three labels therefore burned the whole budget before any optimizer
  work began.
- **Fix:** `run-name` now marks each run `[work]` or `[noop]` from the triggering
  label (known at trigger time), and the guard excludes `[noop]`
  (Workflows `e3550ec8`).
- **Verification:** The observed history counts 5 (trips) under the old
  expression and 2 (passes) under the new one; four genuine runs still trip.
- **Lesson:** A circuit breaker that measures the wrong quantity converts a
  legitimate bulk operation into a false alarm. The guard was counting
  *invocations* when its purpose was to count *work*. Worth checking any
  rate-limit or loop guard for the same confusion.

### F-20 — Round specs rejected by the canonical issue-format contract
- **Date:** 2026-09-04
- **Category:** contract
- **Symptom:** All six seeded issues immediately took `needs-human` +
  `agents:auto-pilot-pause`. Comment: *"Formatter output does not satisfy the
  canonical issue-format contract. validation_audit="Task validation: 5 input →
  5 output. All clean.""*
- **Root cause:** The specs were authored without running
  `.github/scripts/issue_format.py`. All 39 failed three rules: every task must
  name a concrete file or symbol; acceptance criteria must contain a runnable
  gate; and a path must follow a creation verb (`create|add|write|…`) or it is
  read as citing a file that does not exist.
- **Fix:** Rewrote all 39 specs; verified 117/117 rendered bodies pass both the
  format contract and the injection guard before re-seeding.
- **Time to diagnose:** ~30 min, most of it spent on a wrong first hypothesis
  (the prompt-injection guard, which fails closed and produces the same labels).
- **Lesson:** The gate worked exactly as intended — it rejected under-specified
  issues before any agent spent quota on them. The authoring step was what
  skipped validation. Validate spec files locally as part of writing them.

### F-19 — Consumer sync PAT missing `read:org`
- **Date:** 2026-09-04
- **Category:** credential-scope
- **Symptom:** *"GraphQL: Your token has not been granted the required scopes …
  The 'login' field requires ['read:org'], but your token has only been granted:
  ['repo', 'workflow']"*
- **Root cause:** `REPO_TOKEN` resolves to `OWNER_PR_PAT || SERVICE_BOT_PAT`.
  The sync resolves reviewers via org queries; the PAT could not read org data.
- **Fix:** Added `read:org` to the PAT.
- **Note:** The file sync itself had already succeeded — PR #233 matched the
  desired tree. Only the metadata refresh failed, which made a partial success
  look like a total failure.
- **Lesson:** Assert token *scopes*, not just presence, in a preflight.

### F-18 — Canary list included repositories the fork cannot write to
- **Date:** 2026-09-04
- **Category:** configuration
- **Symptom:** Every sync run showed two permanent red failures for
  `stranske/Travel-Plan-Permission` and `stranske/Portable-Alpha-Extension-Model`.
- **Root cause:** `config/consumer_sync_canaries.json` was inherited from
  upstream at fork time and never trimmed.
- **Fix:** Reduced the canary list to `iamkayleb/bukay`.
- **Lesson:** Recurring known-failures train you to ignore red, which hides the
  real ones.

### F-17 — Cursor omitted from two hardcoded agent allowlists
- **Date:** 2026-09-04
- **Category:** design-gap
- **Symptom:** None visible — Cursor issues silently skipped the pre-flight
  capability gate that Claude and Codex issues passed through.
- **Root cause:** `agents-capability-check` gated on a literal
  `["agent:codex","agent:claude","agent:auto"]`, and `agents-auto-label`'s
  skip-list omitted `agent:cursor`, so an already-routed Cursor issue could be
  relabelled to a different agent.
- **Fix:** Both allowlists extended (Workflows `d1ca332e`).
- **Lesson:** Registry-driven routing was undermined by literal enumerations
  the registry never fed. Unequal gating across agents is a silent confound.

### F-16 — Cursor left behind by the loop consolidation
- **Date:** 2026-09-04
- **Category:** design-gap
- **Symptom:** Cursor had a runner, a registry entry and an autofix job, but
  nothing ever invoked it.
- **Root cause:** `reusable-cursor-run.yml` was referenced only by
  `agents-keepalive-loop.yml` and `agents-autofix-loop.yml`. Both were retired in
  favour of `agents-81-gate-followups`, which dispatched only `run-codex` and
  `run-claude`.
- **Fix:** Added `run-cursor` and `autofix-cursor` (Workflows `6d15c0a2`, PR #84).
- **Lesson:** A migration that drops one integration leaves no failing test —
  the capability just quietly stops existing.

### F-15 — `guarded-merge` cannot merge into a non-default branch
- **Date:** 2026-09-03
- **Category:** design-gap
- **Symptom:** *"#229 | skipped | Base branch eval/claude does not match main."*
- **Root cause:** Upstream's merge job only merges pull requests whose base is
  the repository default branch. Every eval-lane PR was refused by design.
- **Fix:** Built `merge-eval-lane` with equivalent guards, scoped to `eval/*`
  (bukay `5fd08e0`).
- **Lesson:** No label or dispatch could have fixed this. Read the guard before
  assuming a labelling problem.

### F-14 — Merge guard counted checkboxes that are never ticked
- **Date:** 2026-09-03
- **Category:** design-gap
- **Symptom:** PR #229 sat at 15/15 with a green Gate and was still refused:
  *"12 unchecked task(s)"*.
- **Root cause:** The guard counted unchecked boxes in the PR body **and its
  linked issue**. In this pipeline the seeded issue is the immutable spec and
  nothing ever ticks it, making the guard permanently unsatisfiable.
- **Fix:** Count the PR body only (bukay `1b482a1`).
- **Lesson:** Copying an upstream guard without checking whether its assumptions
  hold locally.

### F-13 — Seeder footer became phantom unchecked tasks
- **Date:** 2026-09-03
- **Category:** contract
- **Symptom:** Issues showed 15 checkboxes where the spec defined 12.
- **Root cause:** A `---` and two italic provenance lines placed after the final
  checkbox were swept into the list by the issue reformatter. The bridge copies
  the issue body into the PR body, so the phantoms then blocked the merge guard.
- **Fix:** Provenance moved to HTML comments at the top of the body.
- **Lesson:** Prose after a checkbox list is not inert.

### F-12 — Agent PRs could not target a non-default base branch
- **Date:** 2026-09-02
- **Category:** design-gap
- **Symptom:** Every agent PR opened against `main`, making per-agent evaluation
  lanes impossible.
- **Root cause:** The issue bridge hardcoded `const base = data.default_branch`
  with no override.
- **Fix:** Base now resolves `input → issue marker → default`, with an existence
  guard and fallback (Workflows `833be49e`, PR #83). This is the change the whole
  lane architecture rests on.
- **Lesson:** The single highest-leverage fix in the project.

### F-11 — Gate passed but its commit status was never written
- **Date:** 2026-09-02
- **Category:** credential-scope
- **Symptom:** PRs stuck at `action_required` despite a green Gate.
- **Root cause:** Workflow permissions were read-only, so the status write was
  refused. `github-api-with-retry.js` swallows this specific case
  (*"Gate commit status update blocked by permissions; leaving existing status
  untouched"*), so the keepalive read a stale status.
- **Fix:** Workflow permissions set to read and write.
- **Note:** Two wrong hypotheses were pursued first (environment protection
  rules), both corrected by the repository owner from direct observation.
- **Lesson:** A swallowed permission error is worse than a loud one.

### F-10 — GitHub App installation lacked required permissions
- **Date:** 2026-09-02
- **Category:** credential-scope
- **Symptom:** *"422 … the permissions requested are not granted to this
  installation"*.
- **Root cause:** The installation lacked `actions`, `contents`, `issues` and
  `pull-requests`. Granting them in the App settings is not enough — the
  installation must also accept the update.
- **Fix:** Permissions granted and the installation updated.

### F-09 — `USE_CONSOLIDATED_WORKFLOWS` never set
- **Date:** 2026-09-02
- **Category:** configuration
- **Symptom:** `Agents Keepalive Sweep` reported *Skipped* on every hourly run.
- **Root cause:** Four core workflows are gated on this repository variable. The
  previous loop had been deleted and its replacement was switched off, so the
  automation layer was inert while appearing installed.
- **Fix:** Set the variable to `true`.
- **Lesson:** Silently explains several earlier stalls that were investigated as
  agent failures.

### F-08 — Issues and labels created with `GITHUB_TOKEN` trigger nothing
- **Date:** 2026-09-02
- **Category:** design-gap
- **Symptom:** Seeded issues appeared correctly and then sat inert.
- **Root cause:** GitHub's loop guard: events created with `GITHUB_TOKEN` do not
  trigger other workflows. Auto-pilot never saw them.
- **Fix:** All four call sites mint a GitHub App installation token, plus a
  fail-fast guard when neither an App token nor a PAT is available
  (bukay `950750d`).
- **Lesson:** Authored by this project, not inherited. The fail-fast guard exists
  so the same mistake cannot be made silently again.

### F-07 — Dispatch debounce read as a fault
- **Date:** 2026-09-02
- **Category:** by-design
- **Symptom:** `run (agent-run-skipped)` with
  `{"reason": "duplicate-completed", "should_dispatch": "false"}`.
- **Root cause:** None. State-fingerprint debouncing suppressing a re-dispatch
  for an unchanged head SHA.
- **Lesson:** Recorded so it is not re-investigated. Correct behaviour that reads
  as a failure is its own cost.

### F-06 — Bridge ignored its `bridge_agent` input
- **Date:** 2026-09-01
- **Category:** design-gap
- **Symptom:** *"Exactly one agent:* label is required"* on issues dispatched
  with an explicit agent.
- **Fix:** Added an `inputs.agent` fallback to label resolution.

### F-05 — `IncompleteRead` while pulling evaluation data
- **Date:** 2026-09-01
- **Category:** tooling
- **Symptom:** `http.client.IncompleteRead` mid-pagination on Windows.
- **Fix:** Retry on transient faults, a `max_items` cap, and
  `exclude_pull_requests=true` in `agent_eval_pull.py`.

### F-04 — Expired PAT selected by a `||` fallback chain
- **Date:** 2026-09-01
- **Category:** credential-scope
- **Symptom:** `401 Bad credentials` at PR creation.
- **Root cause:** `secrets.A || secrets.B` selects the *non-empty* value, not the
  *working* one. An expired PAT is non-empty, so it always won.
- **Fix:** A token resolver that probes each candidate and a scheduled PAT
  health check.
- **Lesson:** Falsy-coalescing over credentials is an anti-pattern — presence is
  not validity.

### F-03 — Follow-up generator crashed on import
- **Date:** 2026-09-01
- **Category:** tooling
- **Symptom:** `ModuleNotFoundError: No module named 'scripts'`; no issue created.
- **Root cause:** `PYTHONPATH` unset, compounded by a fallback step whose `if:`
  lacked a status function, so it was skipped after the first failure.
- **Lesson:** An `if:` without `failure()` / `always()` carries an implicit
  `success()` — fallback paths silently never run.

### F-02 — Neutral-judge selection mapped providers onto agent names
- **Date:** 2026-09-04
- **Category:** methodology
- **Symptom:** None visible; the scoring was quietly wrong.
- **Root cause:** The selector returned the family name `"codex"` for OpenAI and
  `"claude"` for Anthropic, which coincidentally works for two agents and breaks
  with a third.
- **Fix:** Compute the agent's own family explicitly, then pick a cross-family
  judge, preferring OpenAI for a stable grader.
- **Impact on earlier results:** Rounds recorded before this fix describe OpenAI
  `gpt-5.5` as the neutral judge for **both** Claude and Codex. OpenAI is Codex's
  own family, so that figure is Codex's *self* verdict being compared against
  Claude's *cross* verdict. **Any ranking drawn from those rounds must be
  recomputed before publication.**
- **Lesson:** The measurement apparatus needs the same scrutiny as the thing
  measured.

### F-01 — Expired `CODEX_AUTH_JSON` unnoticed
- **Date:** 2026-08 (and upstream, historically)
- **Category:** credential-scope
- **Symptom:** Agent dispatched, produced no commits, PR stalled.
- **Root cause:** The subscription auth blob does not self-refresh. Nothing
  asserted its validity before dispatch.
- **Fix:** Refreshed via `codex login --device-auth`; secret updated in the
  consumer repository.
- **Note:** Upstream's own history records the same failure going unnoticed for
  34 days. Independent rediscovery of a known failure mode is itself a finding.

## Themes

1. **Presence is not validity.** Five findings (F-01, F-04, F-10, F-11, F-19)
   were credentials that existed and looked healthy. A preflight that asserts
   scopes and liveness would have caught all five.
2. **Read the run state before theorising.** F-22 cost days because a queue
   state (`action_required`, zero jobs, no log) was read as a failure and then
   explained with five successive theories about workflow content. The run's own
   recorded state is primary evidence; the workflow source is not.
3. **Silence is the expensive failure, and it is the default.** F-08, F-09,
   F-11 and F-17 produced no error at all — work simply did not happen. By the
   end that pattern dominated: four independent debounces (F-30), three
   instances of the `GITHUB_TOKEN` loop guard (F-08, F-31, F-33), and a degraded
   judge panel that still rendered a confident-looking report (F-32). Loud
   failures cost minutes; silent ones cost days. The pipeline's observability,
   not its logic, was the real bottleneck.
4. **Readers get fixed; writers get missed.** F-34 took four separate fixes
   because every symptom pointed at a reader. The absent writer never announced
   itself — a marker that was never written and a marker that is not read look
   exactly the same from the outside.
5. **Inherited assumptions do not transfer.** F-14, F-15 and F-18 came from
   upstream code or config whose assumptions did not hold in this fork.
6. **Quality gates worked.** F-20 is the system correctly refusing bad input.
   The friction is that rejection surfaces as a paused label rather than as the
   specific lines to fix.
