#!/usr/bin/env bash
# Pin EXISTING eval issues/PRs to their lane by pre-marking every other agent
# as already tried, so agent_stall_rotation.js has no candidate to rotate to.
#
#   ./eval/pin-rotation.sh            # DRY RUN
#   ./eval/pin-rotation.sh --apply
#
# Rotation is a throughput feature: on a stall the auto-pilot adds
# agent:<next> + agents:tried-<current> and hands the work to another agent.
# For a three-lane comparison that destroys lane isolation — bukay #363 ended
# up with a Codex-authored commit and a Claude keepalive report on the Cursor
# lane. create-round.sh applies these labels to new issues; this backfills the
# ones already open.
set -uo pipefail
REPO="${REPO:-iamkayleb/bukay}"
ALL_AGENTS="claude codex cursor gemini"
APPLY=0; [ "${1:-}" = "--apply" ] && APPLY=1

echo "repo=$REPO  mode=$([ $APPLY -eq 1 ] && echo APPLY || echo DRY-RUN)"
echo

for lane in claude codex cursor; do
  nums=$(gh issue list --repo "$REPO" --label "agent:$lane" --state open --limit 200 \
           --json number -q '.[].number' 2>/dev/null)
  prs=$(gh pr list --repo "$REPO" --label "agent:$lane" --state open --limit 200 \
           --json number -q '.[].number' 2>/dev/null)
  flags=""
  for a in $ALL_AGENTS; do
    [ "$a" = "$lane" ] && continue
    flags="$flags --add-label agents:tried-$a"
  done
  for n in $nums; do
    echo "  issue #$n ($lane) <-$flags"
    [ "$APPLY" -eq 1 ] && gh issue edit "$n" --repo "$REPO" $flags >/dev/null \
      || true
  done
  for n in $prs; do
    echo "  pr    #$n ($lane) <-$flags"
    [ "$APPLY" -eq 1 ] && gh pr edit "$n" --repo "$REPO" $flags >/dev/null \
      || true
  done
done
echo
echo "Done. Re-run with --apply to write."
