# Operational findings — building the local automation layer

**3–6 November 2026 · iamkayleb/bukay**

Everything below was found while replacing the cloud evaluation pipeline with a
local supervisor. They divide into four kinds: defects in the product that four
months of automated rounds never surfaced, defects in the new harness found by
running it, environment and credential problems, and one failure in the old
pipeline that was caused by a guard working exactly as designed.

Issue and pull request numbers are given where they exist, so each finding can
be checked rather than taken on trust.

---

## A. Product defects — found by trying to use the application

**A-01 · `POST /api/services` returned 500 on every request.** Issue #534,
fixed in #538. The route wrote `priceKobo` and `bufferMinutes` to Prisma;
neither is a column. Six files carried the same two names — route, helpers,
zod schema, the form component and three test files — all written 26 June in
one bot commit, `b6ea79f`, before the evaluation began.

The reason it survived fifteen rounds on all three lanes: `app/api/services/
route.ts` contained `prisma.service as unknown as {...}`, a type assertion that
disabled compiler checking on the create call, and every test replaced Prisma
with a mock that accepted a column which does not exist. The compiler could
have caught it; the cast silenced it. The tests could have caught it; the mock
accepted it.

**A-02 · `main` did not build.** Issue #539, fixed in #540. `app/(app)/today/
page.tsx` exported `TodayBooking`, `zonedDayRange`, `listTodaysBookings` and
`TodaySchedule` alongside its default. Next.js App Router pages may export only
a fixed set of names, so `next build` failed the Page type check.

The helpers were exported *so a test could import them* — a test reached into a
module whose exports the framework constrains. 413 tests passed. 93% of
declared files were present. The application did not compile, and no measure in
the evaluation asked whether it did.

**A-03 · A committed test file did not compile.** Fixed directly on `main`.
`__tests__/app/api/auth/auth-flow.test.ts` had two stacked `beforeEach`
headers, putting an `await` inside a non-async function. Nine end-to-end
authentication tests never ran. Identified during the evaluation, carried into
trunk by the lane promotion, and fixed by deleting one line.

**A-04 · The merchant dashboard never reads the session.** Issue #542, open.
This is the largest of them. `resolveTenant()` supports sessions — it returns
`source: "session"` when given one. Not one caller passes a session:

    app/(app)/services/services-list.tsx:20   resolveTenant({ headers })
    app/(app)/layout.tsx:19                   resolveTenant({ headers })
    app/api/services/_helpers.ts:49           resolveTenant({ headers: req.headers })

So resolution always falls through to an `x-tenant-id` header or a subdomain,
neither of which exists in ordinary use. The cookie is signed at sign-in,
`verifySession` and `readSessionTokenFromCookieHeader` both exist, and nothing
in the merchant interface reads any of it. `/calendar` answers "Unable to
determine your business" to a correctly signed-in merchant.

This is the mechanism behind the judgement that the frontend is poor. The
screens are not badly built. They are correctly built and permanently
disconnected from the thing that identifies who is looking at them.

**A-05 · The seeded tenant has no one who can sign in.** Folded into #542.
`prisma/seed.ts` gives the demo owner an email and no phone; sign-in is
phone-only; and an unrecognised number creates a *new* tenant. So the tenant
owning all the seeded data has no signable-in user, which makes every
"a merchant signs in and sees X" criterion unperformable as written.

**A-06 · Calendar and Clients were placeholders.** Issues #535 (done, #541)
and #536 (open). Both pages rendered `SectionPlaceholder` — *"Nothing here yet
— content will appear when available"* — inherited from 26 June. Rounds 4 and
5 specified both screens and both scored as delivered, because the conformance
measure asked whether a file existed and a file did.

---

## B. Harness defects — found by running what we built

Each of these would have appeared as a silent or misleading failure during an
unattended run. All are fixed.

**B-01 · The prompt was truncated at the first newline.** `codex.CMD` is a
batch wrapper, so `cmd.exe` cut a multi-line argument down to one sentence. The
agent received *"You are implementing one GitHub issue in this repository,
unattended"* and nothing else, went looking for the issue on GitHub, hit the
sandbox's network block, and correctly refused to invent requirements. Fixed by
passing the prompt on stdin.

The probe had passed because its prompt is a single line. A test that does not
resemble the real thing passes for the wrong reason.

**B-02 · The agent could not commit its own work.** A git worktree keeps its
index under the *main* repository's `.git/worktrees/<id>/`, outside the
sandbox's writable roots, so `git add` failed with permission denied. The agent
produced twelve correct files and could not save one. Fixed by having the
harness commit, which is where bookkeeping belongs anyway.

**B-03 · Cleanup deleted uncommitted work.** Following B-02, the harness
removed the worktree and destroyed twelve files and 18,730 tokens of work.
Fixed: a worktree with uncommitted changes is now kept, with a log line saying
where it is.

**B-04 · Build caches were committed.** `git add -A` swept `.pnpm-store/v11/
index.db` into PR #541, because `pnpm install` writes a local store into a
fresh worktree. Fixed with pathspec exclusions, and anything excluded is now
printed rather than silently dropped.

**B-05 · The probe matched its own question.** It asked the agent to reply
`PROBE_OK` and then searched the output for `PROBE_OK`. Codex echoes the prompt
in its transcript, so a dead agent — rejecting the model with a 400 — was
reported as working. Fixed: the prompt now *describes* the token rather than
spelling it, so a match can only have come from the model.

Same shape as A-01's mock: a check that cannot fail for the reason it exists.

**B-06 · The lock asked how old a file was, not whether a process was alive.**
A restart kills the supervisor without running its cleanup, leaving a lock with
a recent timestamp and a dead process behind it. The next logon refused to
start for up to six hours. Fixed with a real liveness check.

**B-07 · A failed round recorded no diagnosis.** The supervisor logged
`work.py`'s stdout and ignored stderr. The first unattended failure, 20:52 on 5
November, left one line and no cause. Fixed: stderr is captured and logged.

**B-08 · Recovery was invisible.** Only the last line of prerun was logged, and
recovery explains itself on the lines before the verdict — so a recovered round
looked identical to an idle one. Fixed.

**B-09 · `doctor` checked the wrong help page.** It validated `codex exec`'s
flags against `codex --help`, which lists only subcommands, so a correct flag
appeared missing and a wrong one appeared fine. Fixed by declaring the help
command per adapter.

**B-10 · The formatter was left to the agent.** `prettier --check` is a CI
gate; an agent that forgets it fails the build for a reason unrelated to
whether its change is correct. Fixed: the harness formats before committing.

---

## C. Environment and credentials

**C-01 · Cursor's Windows binary is `agent.ps1`.** Not `cursor-agent`, not an
executable, and not on Git Bash's PATH. A PowerShell script cannot be run by
`subprocess` the way a `.CMD` can; it must be handed to PowerShell explicitly.

**C-02 · The Codex CLI was 28 versions stale.** 0.138.0, defaulting to a model
(`gpt-5.5`) that a ChatGPT Plus plan does not serve over the CLI login path.
Every model name in `config/model_registry.json` — last updated 7 February —
was also dead. Updating to 0.166.0 fixed it; its default is now `gpt-6.1-sol`.

**C-03 · Claude's OAuth token expired mid-session**, and Cursor's cached login
was absent until `agent login` ran. Both presented as broken invocations rather
than as credential problems until the probe learned to say so.

**C-04 · Cursor's "flakiness" was cold-start authentication.** Three early runs
gave three different results — pass, hang, connection reset — all taken while
authentication was being set up. Ten consecutive runs afterwards were clean,
with times falling from 18.5s to 9.4s. The conclusion drawn from three
observations was wrong and reversed by measuring properly.

**C-05 · The cloud pipeline never ran on this account's entitlement.** CI wrote
a `CODEX_AUTH_JSON` secret to `~/.codex/auth.json` — a credential belonging to
some other account. "We ran Codex for fifteen rounds" meant "a secret ran Codex
for fifteen rounds", and nothing ever checked whose.

**C-06 · A scheduled task does not inherit a shell's exports.** `BUKAY_REPO_DIR`
set with `export` in Git Bash is invisible to Task Scheduler; it must be a
Windows user variable. This is the most likely cause of an unattended night
that produces nothing.

**C-07 · Task Scheduler defaults hostile to a laptop.** *"Start the task only
if the computer is on AC power"* is ticked by default, and its child *"Stop if
the computer switches to battery power"* stays set even when greyed out, and
cannot be cleared without an elevated shell.

---

## D. The old pipeline

**D-01 · A correct guard became the bug.** `eval-lane-base-guard.yml` fires on
`pull_request_target` for any branch named `claude/`, `codex/` or `cursor/` and
rewrites the pull request's base to `eval/<agent>`. Its own header explains
why it exists:

> Four components, four separate bugs, each found only after a PR landed on the
> wrong branch. This closes the class.

It did close the class. Then `main` became the trunk and the premise beneath it
— *an agent branch belongs to an eval lane* — stopped being true. The guard
carried on enforcing it, rewriting PR #541 from `main` to `eval/codex` and
turning a nine-file change into a hundred-file conflict.

This is a different failure from the others. A-01 and A-04 never worked. This
worked correctly, and kept working after it should have stopped.

**D-02 · Thirty-one workflows were still live**, including the belt dispatcher,
the keepalive loop, issue intake and the optimizer — all watching the same
issues the new supervisor works, and all holding metered API keys. Now
disabled; CI, Gate, Coverage Guard, Lighthouse and Dependabot remain.

**D-03 · `config/model_registry.json` is nine months stale** in the Workflows
repository and still drives routing and cost decisions there. Its newest entry
is `gpt-5.5`; nothing in it resolves today.

---

## What recurs

**A check that cannot fail for the reason it exists.** A mock accepting a
column that is not there (A-01). A probe matching its own question (B-05). A
test importing from a page, forcing exports that break the build (A-02).

**A question asked because it is easy, in place of the one that matters.** How
old is this lock file, rather than is that process running (B-06). Does this
file exist, rather than does the application build (A-02) or can anyone sign in
(A-04).

**Silence as the default failure mode.** A round that failed and recorded
nothing (B-07). A recovery indistinguishable from an idle tick (B-08). A
scheduled task that does not start because of a power setting, and says
nothing (C-07).

**Work that passes every test and cannot be used.** The three lanes produced
413 passing tests, 93% declared-file conformance, and an application that did
not compile, could not create a service, and did not read its own login.

---

## Where the two approaches differ, measured

| | Cloud evaluation | Local layer |
|---|---|---|
| Duration | ~6 weeks | 4 days |
| Issues raised | 202 | 5 |
| Pull requests | 295 | 4 |
| Metered spend | $43.66 | $0 |
| Trunk builds | no | yes |
| A UI criterion performed by a person | never | twice |

The cloud pipeline's output was not wrong so much as unverifiable. Nothing in
it ever asked whether a human could use the result, so nothing in it ever
found out.
