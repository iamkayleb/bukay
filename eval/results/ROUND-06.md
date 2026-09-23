# Round 6 — first valid measurement

Specs: `public-page`, `availability-engine`. Three agents, identical bodies,
isolated lanes. **This is the first round where all three agents ran under a
correctly configured pipeline.** Rounds 1–5 are void (see below).

## Outcomes

| Agent | Spec | Outcome | Cause | Evidence |
|---|---|---|---|---|
| claude | availability-engine | Unaided | — | `app/lib/availability.ts` 126 lines, `__tests__/availability.test.ts` 329 lines |
| claude | public-page | Unaided | — | `app/[slug]/page.tsx`, `app/[slug]/data.ts`, page test |
| cursor | availability-engine | Unaided | — | `app/lib/availability.ts` 238 lines, test 495 lines, bench 28 lines |
| cursor | public-page | Unaided | — | `app/[slug]/page.tsx`, `head.tsx`, `tenant.ts`, 2 tests |
| codex | availability-engine | **Blocked → Unaided on retry** | `infra` first attempt | see below |
| codex | public-page | **Blocked → Unaided on retry** | `infra` first attempt | see below |

**Fill in Codex's line counts and both agents' verify:compare verdicts before
publishing.** The table above records what was observed directly.

## Codex's first attempt was an environment failure, not a capability failure

Codex ran, executed **zero commands**, changed **zero files**, and reported why:

> Blocked: the workspace shell fails before any command runs
> (`bwrap: loopback: Failed RTM_NEWADDR: Operation not permitted`). I therefore
> can't inspect the existing availability API, run tests, or create the required
> verified commit safely.

`sandbox: workspace-write` makes Codex isolate with bubblewrap, and bwrap cannot
create a loopback interface on a GitHub-hosted runner. The job still went green,
the ledger closed the task, and the only commit was a telemetry timestamp — so
from outside it was indistinguishable from an agent that does nothing.

Fixed by passing `sandbox: danger-full-access` on both Codex paths in the
consolidated loop (Workflows `43cbb88f`). On the reseeded attempt Codex produced
real work.

**Classification: `infra`.** Scoring the first attempt against Codex would
measure the sandbox, not the model.

## Why rounds 1–5 are excluded

`main` already contained the scaffold, the nine Prisma models, auth, the
dashboard shell and the services CRUD before seeding began. Five of six round-1
issues asked agents to build what already existed, and the specs were written
against a greenfield assumption that did not hold. Those attempts measure the
specification, not the agents.

Round 6 was chosen because a path-level diff of `main` against all 19 specs
showed `public-page` and `availability-engine` as the first entirely unbuilt
work (0 of 2 and 0 of 3 cited paths present).

## Observations worth reporting

**Volume differs consistently.** On the same spec Cursor wrote 238 lines of
implementation and 495 of test; Claude wrote 126 and 329. Whether that is
thoroughness or verbosity is a judgement to state explicitly rather than score.

**Claude reformats unrelated files.** On both round-1 and round-6 branches it ran
Prettier across the repository, touching `.coderabbit.yaml`,
`config/model_registry.json` and 551 lines of `design-system/*.css` with no
semantic change. Its raw file-count is therefore not comparable to the others';
count only files the spec names.

**Codex reported its blocker precisely and refused to fake progress.** That is a
positive behaviour, and it was invisible because the pipeline discarded the
report. See F-23.

## Caveats that must appear alongside any number

1. Codex's first attempt is excluded as `infra`; its retry ran on a different
   day with a fixed sandbox.
2. Cursor runs on a metered plan, Claude and Codex on flat subscriptions.
3. Claude and Cursor were seeded once; Codex was seeded twice.
4. Neutral judge differs per agent — see `../SCORING.md`.
