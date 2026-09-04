# Evaluation round specs

One file per round. Each is seeded separately:

    Actions -> Eval Seed Issues -> Run workflow
      spec_path: eval/rounds/round-01.json
      dry_run:   true   (then false)

Each file produces `specs x agents` issues — 2 specs x 3 agents = 6 issues per
round, byte-identical across the three lanes.

## Sequence rounds; do not seed them all at once

Round N+1 builds on round N's code. Seeding ahead means an agent works against
a foundation that does not exist yet, and three agents racing on overlapping
files turns lane timing into noise instead of signal.

Seed round N -> let all three lanes merge -> **record verdicts** -> seed N+1.

## Rounds that need a human first

These specs touch third-party services an agent cannot provision. Each is
written to build against a port with a fake adapter, so CI passes without live
credentials — but the real integration needs your setup:

| Round | Spec | Human prerequisite |
|---|---|---|
| 02 | `auth-otp` | Termii (or other SMS) account |
| 05 | `tenant-settings` | S3-compatible bucket (falls back to local FS) |
| 08 | `paystack-charge` | Paystack test keys + subaccount |
| 10 | `flutterwave` | Flutterwave sandbox |
| 10 | `whatsapp-port` | Meta business number + approved templates |
| 18 | `observability` | Grafana or equivalent |

If the capability check marks one BLOCKED, that is a real signal — record it.
Add `capability:override` only if you want the agent to attempt it anyway, and
note the override in the scorecard.

## Excluded from the original list

"Adopt Workflows reusable actions" is deliberately not a spec. This repo already
consumes the reusable workflows, and having an agent edit `.github/` would mean
rewriting the pipeline that is running it mid-flight. Round 01 carries an
explicit non-goal forbidding changes under `.github/`.
