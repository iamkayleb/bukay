#!/usr/bin/env bash
# Dispatch the belt directly for the issues of ONE round, skipping auto-pilot.
#
#   ./eval/dispatch-round.sh 9                       # DRY RUN
#   ./eval/dispatch-round.sh 9 --apply
#   ./eval/dispatch-round.sh 9 --apply --agent cursor
#   ./eval/dispatch-round.sh follow-ups --apply      # every open follow-up
#   ./eval/dispatch-round.sh all --apply             # every open eval issue
#
# `follow-ups` selects open issues labelled `follow-up`; `all` selects every
# open issue carrying a lane label. Both apply the same safety skips, so this
# is one command per batch rather than two dispatches per issue.
#
# Pairs with `create-round.sh <n> --apply --no-autopilot`. Auto-pilot's format
# and optimize stages add nothing to a pre-rendered round issue and have paused
# several (bukay #354, #378, #390, #391), so this goes straight to the stages
# that do the work.
#
# TWO dispatches are needed, because the belt is three workflows, not one:
#
#   71 Belt Dispatcher        selects the issue and CREATES THE BRANCH. It then
#                             only removes status:ready and comments. It does
#                             NOT start the worker.
#   73 Belt Conveyor          would start the worker, but it is workflow_call
#                             only — auto-pilot is what normally calls it, so
#                             with auto-pilot off nothing does.
#   72 Belt Worker Dispatch   the manual entry point: runs the agent and opens
#                             the PR against `base`.
#
# Running 71 alone leaves a branch sitting at the lane tip with no PR and no
# work, which is exactly what happened on bukay #390, #391 and #395.
#
# The lane comes from the issue's `agent:<x>` label and the base from
# `eval/<x>`, both of which create-round.sh set, so a mislabelled issue is
# skipped rather than dispatched into the wrong lane.
set -uo pipefail
REPO="${REPO:-iamkayleb/bukay}"
DISPATCHER="Agents 71 Codex Belt Dispatcher"
WORKER="Agents 72 Codex Belt Worker Dispatch"
ROUND="${1:?usage: dispatch-round.sh <round|follow-ups|all> [--apply] [--agent <name>]}"
shift || true
APPLY=0; ONLY=""
while [ $# -gt 0 ]; do
  case "$1" in
    --apply) APPLY=1 ;;
    --agent) shift; ONLY="${1:-}" ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
  shift || true
done

echo "repo=$REPO  select=$ROUND  mode=$([ $APPLY -eq 1 ] && echo APPLY || echo DRY-RUN)${ONLY:+  agent=$ONLY}"
echo

case "$ROUND" in
  follow-ups) SELECTOR=(--label "follow-up"); WHAT="open follow-up issues" ;;
  all)        SELECTOR=();                    WHAT="open issues with a lane label" ;;
  *)          SELECTOR=(--label "eval:round-$ROUND"); WHAT="open issues labelled eval:round-$ROUND" ;;
esac

rows=$(gh issue list --repo "$REPO" "${SELECTOR[@]}" --state open --limit 200 \
        --json number,labels \
        -q '.[] | [.number, ([.labels[].name] | join(" "))] | @tsv' 2>/dev/null)

[ -z "$rows" ] && { echo "  no $WHAT"; exit 0; }

count=0
while IFS=$'\t' read -r num labels; do
  [ -z "$num" ] && continue
  # Exactly one concrete agent label, ignoring agent:auto — which the keepalive
  # would otherwise let override the lane and route to the registry default.
  lane=$(printf '%s\n' "$labels" | tr ' ' '\n' | grep '^agent:' \
         | sed 's/^agent://' | grep -v '^auto$' | sort -u)
  n_lane=$(printf '%s' "$lane" | grep -c .)
  if [ "$n_lane" != "1" ]; then
    echo "  skip #$num  expected one agent:<x> label, found: ${lane:-none}"
    continue
  fi
  case "$labels" in
    *"agent:auto"*) echo "  skip #$num  carries agent:auto; remove it or the lane label is ignored"; continue ;;
    *"needs-human"*) echo "  skip #$num  needs-human"; continue ;;
    *"agents:auto-pilot-pause"*) echo "  skip #$num  agents:auto-pilot-pause"; continue ;;
  esac
  [ -n "$ONLY" ] && [ "$lane" != "$ONLY" ] && continue

  branch="$lane/issue-$num"
  echo "  dispatch #$num  agent=$lane  branch=$branch  base=eval/$lane"
  if [ "$APPLY" -eq 1 ]; then
    # 1. create the branch
    if gh workflow run "$DISPATCHER" --repo "$REPO" \
         -f agent_key="$lane" \
         -f force_issue="$num" \
         -f base_branch="eval/$lane"; then
      echo "    + branch dispatch queued"
    else
      echo "    ! branch dispatch failed"; continue
    fi

    # Give the dispatcher time to create the branch; the worker needs it to
    # exist before it can prepare a PR from it.
    printf '    . waiting for %s' "$branch"
    for _ in $(seq 1 20); do
      sleep 6; printf '.'
      if gh api "repos/$REPO/branches/$branch" >/dev/null 2>&1; then
        echo " present"; break
      fi
    done
    if ! gh api "repos/$REPO/branches/$branch" >/dev/null 2>&1; then
      echo
      echo "    ! $branch never appeared; check the 71 dispatcher run before retrying"
      continue
    fi

    # 2. run the agent and open the PR
    if gh workflow run "$WORKER" --repo "$REPO" \
         -f agent_key="$lane" \
         -f issue="$num" \
         -f branch="$branch" \
         -f base="eval/$lane" \
         -f source="eval-dispatch-round"; then
      echo "    + worker dispatch queued"
    else
      echo "    ! worker dispatch failed"; continue
    fi
    sleep 5
  fi
  count=$((count+1))
done <<< "$rows"

echo
if [ "$APPLY" -eq 1 ]; then
  echo "  dispatched: $count"
  echo "  watch: gh run list --repo $REPO --workflow \"$WORKER\" --limit 10"
else
  echo "  would dispatch: $count   (re-run with --apply)"
fi
