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
# Every agent the registry marks eligible. gemini is enabled: true in
# .github/agents/registry.yml, so rotation can reach it and it must be pinned
# too, even though no gemini lane exists here.
ALL_AGENTS="claude codex cursor gemini"
APPLY=0; [ "${1:-}" = "--apply" ] && APPLY=1

echo "repo=$REPO  mode=$([ $APPLY -eq 1 ] && echo APPLY || echo DRY-RUN)"
echo

# gh issue edit validates every label up front and aborts the whole call if one
# is missing, so a single absent label silently applies none of them. Create
# them before touching anything.
have=$(gh label list --repo "$REPO" --limit 300 --json name -q '.[].name' 2>/dev/null)
for a in $ALL_AGENTS; do
  name="agents:tried-$a"
  if printf '%s\n' "$have" | grep -qxF "$name"; then
    echo "  label ok       $name"
  else
    echo "  label MISSING  $name"
    if [ "$APPLY" -eq 1 ]; then
      gh label create "$name" --repo "$REPO" --color "D4C5F9" \
        --description "Records an agent already tried during bounded stall rotation" \
        && echo "    + created" \
        || { echo "    ! could not create $name — aborting"; exit 1; }
    fi
  fi
done
if [ "$APPLY" -eq 0 ]; then
  echo "  (dry run: missing labels would be created before any edit)"
fi
echo

ok=0; fail=0
for lane in claude codex cursor; do
  flags=""
  for a in $ALL_AGENTS; do
    [ "$a" = "$lane" ] && continue
    flags="$flags --add-label agents:tried-$a"
  done

  nums=$(gh issue list --repo "$REPO" --label "agent:$lane" --state open --limit 200 \
           --json number -q '.[].number' 2>/dev/null)
  prs=$(gh pr list --repo "$REPO" --label "agent:$lane" --state open --limit 200 \
           --json number -q '.[].number' 2>/dev/null)

  for n in $nums; do
    echo "  issue #$n ($lane)"
    if [ "$APPLY" -eq 1 ]; then
      if gh issue edit "$n" --repo "$REPO" $flags >/dev/null 2>&1; then
        ok=$((ok+1))
      else
        echo "    ! failed"; fail=$((fail+1))
      fi
      sleep 1
    fi
  done
  for n in $prs; do
    echo "  pr    #$n ($lane)"
    if [ "$APPLY" -eq 1 ]; then
      if gh pr edit "$n" --repo "$REPO" $flags >/dev/null 2>&1; then
        ok=$((ok+1))
      else
        echo "    ! failed"; fail=$((fail+1))
      fi
      sleep 1
    fi
  done
done

echo
if [ "$APPLY" -eq 1 ]; then
  echo "  pinned: $ok   failed: $fail"
else
  echo "  dry run — nothing written. Re-run with --apply."
fi
