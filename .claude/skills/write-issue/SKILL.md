---
name: write-issue
description: >-
  Turn a one-line request into a Bukay issue the agent belt can actually build,
  then create it with gh. Produces the enforced body sections, tasks that name
  real files, acceptance criteria with a runnable gate, [AC-n] tags on anything
  about the interface, and the fintech presentation bar so the result does not
  look like a form with a button. Validates with issue_format.py before
  creating anything. Use when turning an idea, a defect or a gap into tracked
  agent work. Do NOT use for the follow-up issues the verifier writes after a
  merge — those are machine-written on a different path — and do not use it for
  notes, questions or anything no coding agent is going to pick up.
---

# Writing an issue the belt can build

An issue here is not a note. It is the complete specification a coding agent
works from unattended, and the contract a verifier later grades the result
against. If a criterion cannot be checked, nothing downstream can tell whether
the work was done — which is how this project once accumulated 413 passing
tests, 93% declared-file conformance, and an application that did not compile.

## When to use

Turning an idea, a defect, or a gap into tracked agent work.

## When NOT to use

- **Follow-up issues after a merge.** `agents-verify-to-new-pr.yml` writes
  those from a verdict and labels them `agents:auto-pilot`, which starts a
  round on its own. Writing one by hand duplicates work and can double-dispatch.
- **Notes, questions, decisions, spikes.** If no coding agent is going to pick
  it up, it is not this.
- **Workflows maintenance.** Template sync, lane management and reusable
  workflow changes belong in `iamkayleb/Workflows`, not in this repo's tracker.

## The recipe

1. **Ground it.** Read the code before writing a word. Every task must name a
   file that exists, or a file the issue itself creates. "Add validation" is
   not a task; `app/api/clients/route.ts` rejecting a duplicate phone with 409
   is. Check `references/product-map.md` for what is already built, so the
   issue advances the product instead of re-specifying it.

2. **Write the body** in this order. `## Tasks` and `## Acceptance Criteria`
   are enforced by `issue_format.py`; the rest is what makes the work land in
   one round instead of three.

   ```markdown
   ## Why
   What is missing, with evidence: file:line, a failing command, a screenshot.

   ## Scope
   What this covers, and its boundary.

   ## Non-Goals
   What "done" explicitly does not include. Blocks a scaffold-only claim.

   ## Tasks
   - [ ] Each starts with a verb and names a real path, symbol or config key.

   ## Acceptance Criteria
   - [ ] Each verifiable, specific, independent — with a runnable gate.

   ## Implementation Notes
   File paths, constraints, the existing pattern to follow.
   ```

3. **Tag interface criteria `[AC-n]`.** Any criterion about what a person sees
   gets a number, and the agent is expected to write a Playwright spec whose
   title carries that tag. CI then reports it per criterion and the verifier
   reads the result instead of guessing from the diff. See
   `docs/guides/UI_ACCEPTANCE.md` in the Workflows repo for the full contract,
   and `e2e/booking.spec.ts` here for the shape.

4. **Apply the presentation bar.** Read `references/fintech-ui-bar.md` for
   anything a merchant or client looks at, and put its requirements in the body
   as criteria. An issue that does not mention how it should look gets
   something that works and nobody wants to use.

5. **Validate before creating.** This is the step that makes the skill worth
   trusting rather than merely fast:

   ```bash
   python .github/scripts/issue_format.py /tmp/issue-body.md
   ```

   Same validator `agents-issue-intake.yml` runs. A pass prints
   `Issue body is agent-processable`; advisories about paths a task creates
   are expected. Fix anything else it reports. Do not create an issue the
   belt will reject.

6. **Create it.**

   ```bash
   gh issue create --repo iamkayleb/bukay \
     --title "<short, states the user-visible outcome>" \
     --body-file /tmp/issue-body.md \
     --label "ready:agent"
   ```

   Stop there. `ready:agent` records human approval; it does not start
   anything. A round begins only when an `agent:*` label is added, and choosing
   which agent — and when — stays with the person.

## The two failure modes to design against

**A task an agent cannot finish.** It names no file, or names one that does not
exist, so the agent invents a location and the reviewer cannot tell whether it
was right. The validator rejects most of these; write for the bar, not the
validator.

**A criterion nobody can check.** "Works correctly", "looks good", "handles
errors". If you cannot name the command, the test, or the thing on screen that
proves it, rewrite it until you can. A criterion that cannot fail is worse than
no criterion, because it reads as evidence.

## Sizing

One round is roughly 12 tasks and a 45-minute agent budget. An issue needing
much more than that should be split — not because the agent gives up, but
because a half-finished round leaves a PR nobody can review.

## References

- `references/product-map.md` — what Bukay is, what is built, what is next.
- `references/fintech-ui-bar.md` — the presentation standard, in checkable terms.
- `references/worked-example.md` — one issue that passes the validator, annotated.
- `docs/AGENT_ISSUE_FORMAT.md` — the full format spec, with worked examples.
- `.github/scripts/issue_format.py` — the validator the belt runs.
